import * as NodeSocket from "@effect/platform-node/NodeSocket"
import * as NodeSocketServer from "@effect/platform-node/NodeSocketServer"
import {
  Cause,
  Deferred,
  Effect,
  Fiber,
  Queue,
  Ref,
  Schema,
  Scope,
  Stream,
} from "effect"
import type * as SocketServer from "effect/unstable/socket/SocketServer"

import {
  MaximumSessionEventBytes,
  SessionEvent,
  type SessionEvent as SessionEventValue,
} from "../domain/session.js"

const maximumCommandBytes = 4 * 1024

export const SessionCommand = Schema.TaggedUnion({
  SubscribeSession: {
    protocolVersion: Schema.Literal(1),
  },
  SubscribeSessions: {
    protocolVersion: Schema.Literal(2),
  },
})

export type SessionCommand = typeof SessionCommand.Type

const SessionCommandJson = Schema.fromJsonString(SessionCommand)
const SessionEventJson = Schema.fromJsonString(SessionEvent)

export class LocalIpcError extends Schema.TaggedErrorClass<LocalIpcError>()(
  "PackWalk.LocalIpcError",
  {
    code: Schema.Literals([
      "connection-unavailable",
      "invalid-frame",
      "transport-unavailable",
    ]),
    message: Schema.String,
  },
) {}

const ipcError = (
  code: LocalIpcError["code"],
  message: string,
): LocalIpcError => new LocalIpcError({ code, message })

interface FrameState {
  readonly buffered: Uint8Array
}

const combineBytes = (
  first: Uint8Array,
  second: Uint8Array,
): Uint8Array => {
  if (first.byteLength === 0) return second
  if (second.byteLength === 0) return first

  const combined = new Uint8Array(first.byteLength + second.byteLength)
  combined.set(first)
  combined.set(second, first.byteLength)
  return combined
}

const frameDecoder = (maximumBytes: number) =>
  Effect.gen(function* () {
    const state = yield* Ref.make<FrameState>({ buffered: new Uint8Array() })
    const textDecoder = new TextDecoder("utf-8", { fatal: true })

    return (chunk: Uint8Array) =>
      Ref.modify(state, (current): readonly [
        Effect.Effect<ReadonlyArray<string>, LocalIpcError>,
        FrameState,
      ] => {
        const lines: Array<string> = []
        let buffered = current.buffered
        let frameStart = 0

        try {
          for (let index = 0; index < chunk.byteLength; index += 1) {
            if (chunk[index] !== 0x0a) {
              if (buffered.byteLength + index - frameStart + 1 > maximumBytes) {
                throw new Error("frame too large")
              }
              continue
            }

            const frame = combineBytes(buffered, chunk.subarray(frameStart, index))
            const line = textDecoder.decode(frame)
            if (line.length > 0) lines.push(line)
            buffered = new Uint8Array()
            frameStart = index + 1
          }

          const tail = chunk.subarray(frameStart)
          buffered = combineBytes(buffered, Uint8Array.from(tail))
          return [Effect.succeed(lines), { buffered }]
        } catch {
          return [
            Effect.fail(
              ipcError("invalid-frame", "PackWalk received an invalid IPC frame"),
            ),
            { buffered: new Uint8Array() },
          ]
        }
      }).pipe(Effect.flatten)
  })

export type SessionEventServer = SocketServer.SocketServer["Service"]

export const makeSessionEventServer = (
  endpoint: string,
): Effect.Effect<SessionEventServer, LocalIpcError, Scope.Scope> =>
  NodeSocketServer.make({
    path: endpoint,
    exclusive: true,
    readableAll: false,
    writableAll: false,
  }).pipe(
    Effect.mapError(() =>
      ipcError(
        "transport-unavailable",
        "PackWalk could not start its local session service",
      ),
    ),
  )

const serveClient = (
  socket: import("effect/unstable/socket/Socket").Socket,
  events: Stream.Stream<SessionEventValue>,
  refresh: Effect.Effect<void>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const command = yield* Deferred.make<SessionCommand, LocalIpcError>()
      const decodeFrames = yield* frameDecoder(maximumCommandBytes)
      const write = yield* socket.writer

      const read = socket.run((chunk) =>
        decodeFrames(chunk).pipe(
          Effect.flatMap((lines) =>
            Effect.forEach(lines, (line) =>
              Schema.decodeUnknownEffect(SessionCommandJson, {
                onExcessProperty: "error",
              })(line).pipe(
                Effect.mapError(() =>
                  ipcError(
                    "invalid-frame",
                    "PackWalk received an invalid IPC frame",
                  ),
                ),
                Effect.flatMap((decoded) => Deferred.succeed(command, decoded)),
              ),
            ),
          ),
        ),
      )

      const reader = yield* read.pipe(
        Effect.mapError((error) =>
          error instanceof LocalIpcError
            ? error
            : ipcError(
                "connection-unavailable",
                "PackWalk lost its local session connection",
              ),
        ),
        Effect.forkScoped,
      )
      const readerStopped = Fiber.join(reader).pipe(
        Effect.flatMap(() =>
          Effect.fail(
            ipcError(
              "connection-unavailable",
              "PackWalk lost its local session connection",
            ),
          ),
        ),
      )
      yield* Effect.raceFirst(Deferred.await(command), readerStopped)
      yield* refresh

      yield* events.pipe(
        Stream.runForEach((event) =>
          Schema.encodeEffect(SessionEventJson)(event).pipe(
            Effect.mapError(() =>
              ipcError(
                "invalid-frame",
                "PackWalk could not encode a session event",
              ),
            ),
            Effect.filterOrFail(
              (encoded) =>
                Buffer.byteLength(encoded, "utf8") <= MaximumSessionEventBytes,
              () =>
                ipcError(
                  "invalid-frame",
                  "PackWalk could not encode a session event",
                ),
            ),
            Effect.flatMap((encoded) => write(`${encoded}\n`)),
          ),
        ),
      )
    }),
  )

export const runSessionEventServer = (
  server: SessionEventServer,
  events: Stream.Stream<SessionEventValue>,
  refresh: Effect.Effect<void> = Effect.void,
): Effect.Effect<never, LocalIpcError> =>
  server
    .run((socket) =>
      serveClient(socket, events, refresh).pipe(
        Effect.catch(() => Effect.void),
      ),
    )
    .pipe(
      Effect.mapError(() =>
        ipcError(
          "transport-unavailable",
          "PackWalk's local session service stopped",
        ),
      ),
    )

export const connectSessionEvents = (
  endpoint: string,
): Effect.Effect<
  Stream.Stream<SessionEventValue, LocalIpcError>,
  LocalIpcError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const socket = yield* NodeSocket.makeNet({
      path: endpoint,
      openTimeout: "1 second",
    })
    const queue = yield* Queue.bounded<
      SessionEventValue,
      LocalIpcError | Cause.Done
    >(16)
    const opened = yield* Deferred.make<void, LocalIpcError>()
    const decodeFrames = yield* frameDecoder(MaximumSessionEventBytes)
    const write = yield* socket.writer
    const request = yield* Schema.encodeEffect(SessionCommandJson)(
      SessionCommand.cases.SubscribeSessions.make({ protocolVersion: 2 }),
    ).pipe(
      Effect.mapError(() =>
        ipcError("invalid-frame", "PackWalk could not encode its IPC request"),
      ),
    )

    const read = socket.run(
      (chunk) =>
        decodeFrames(chunk).pipe(
          Effect.flatMap((lines) =>
            Effect.forEach(lines, (line) =>
              Schema.decodeUnknownEffect(SessionEventJson, {
                onExcessProperty: "error",
              })(line).pipe(
                Effect.mapError(() =>
                  ipcError(
                    "invalid-frame",
                    "PackWalk received an invalid session event",
                  ),
                ),
                Effect.flatMap((event) => Queue.offer(queue, event)),
              ),
            ),
          ),
        ),
      {
        onOpen: write(`${request}\n`).pipe(
          Effect.mapError(() =>
            ipcError(
              "connection-unavailable",
              "PackWalk could not query its local session service",
            ),
          ),
          Effect.matchEffect({
            onFailure: (error) => Deferred.fail(opened, error),
            onSuccess: () => Deferred.succeed(opened, undefined),
          }),
          Effect.asVoid,
        ),
      },
    ).pipe(
      Effect.mapError((error) =>
        error instanceof LocalIpcError
          ? error
          : ipcError(
              "connection-unavailable",
              "PackWalk could not connect to its local session service",
            ),
      ),
    )

    yield* read.pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Deferred.fail(opened, error).pipe(
            Effect.andThen(Queue.fail(queue, error)),
            Effect.asVoid,
          ),
        onSuccess: () => Queue.end(queue).pipe(Effect.asVoid),
      }),
      Effect.forkScoped,
    )
    yield* Deferred.await(opened)

    return Stream.fromQueue(queue)
  })

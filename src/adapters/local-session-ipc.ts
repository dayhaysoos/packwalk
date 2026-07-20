import * as NodeSocket from "@effect/platform-node/NodeSocket"
import * as NodeSocketServer from "@effect/platform-node/NodeSocketServer"
import {
  Cause,
  Deferred,
  Effect,
  Fiber,
  Option,
  Queue,
  Ref,
  Schema,
  Scope,
  Stream,
} from "effect"
import type * as SocketServer from "effect/unstable/socket/SocketServer"

import {
  encodeSessionProtocolEvent,
  encodeSessionHistoryProtocolResponse,
  MaximumSessionEventBytes,
  SessionHistory,
  SessionHistoryCursor,
  SessionHistoryProtocolResponseJson,
  SessionHistoryUnavailable,
  type SessionHistoryCursor as SessionHistoryCursorValue,
  type SessionHistoryCoverage,
  type SessionEvidenceFact,
  type SessionHistoryProtocolResponse,
  SessionIdentity,
  type SessionIdentity as SessionIdentityValue,
  SessionProtocolEventJson,
  type SessionProtocolEvent as SessionProtocolEventValue,
  type SessionView,
} from "../domain/session.js"

export const MaximumSessionCommandBytes = 32 * 1024

export const SessionCommand = Schema.TaggedUnion({
  SubscribeSessions: {
    protocolVersion: Schema.Literal(4),
  },
  InspectSessionHistory: {
    protocolVersion: Schema.Literal(4),
    sessionId: SessionIdentity,
    cursor: Schema.NullOr(SessionHistoryCursor),
  },
})

export type SessionCommand = typeof SessionCommand.Type

const SessionCommandJson = Schema.fromJsonString(SessionCommand)

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
  events: Stream.Stream<SessionProtocolEventValue>,
  refresh: Effect.Effect<void>,
  inspectHistoryPage: (
    sessionId: SessionIdentityValue,
    cursor: SessionHistoryCursorValue | null,
  ) => Effect.Effect<SessionHistoryProtocolResponse>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const command = yield* Deferred.make<SessionCommand, LocalIpcError>()
      const decodeFrames = yield* frameDecoder(MaximumSessionCommandBytes)
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
      const request = yield* Effect.raceFirst(Deferred.await(command), readerStopped)
      if (request._tag === "InspectSessionHistory") {
        const response = yield* inspectHistoryPage(request.sessionId, request.cursor)
        const encoded = yield* encodeSessionHistoryProtocolResponse(response).pipe(
          Effect.mapError(() =>
            ipcError(
              "invalid-frame",
              "PackWalk could not encode a session history response",
            ),
          ),
        )
        yield* write(`${encoded}\n`)
        return
      }

      yield* refresh

      yield* events.pipe(
        Stream.runForEach((event) =>
          encodeSessionProtocolEvent(event).pipe(
            Effect.mapError(() =>
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
  events: Stream.Stream<SessionProtocolEventValue>,
  refresh: Effect.Effect<void> = Effect.void,
  inspectHistoryPage: (
    sessionId: SessionIdentityValue,
    cursor: SessionHistoryCursorValue | null,
  ) => Effect.Effect<SessionHistoryProtocolResponse> = (sessionId) =>
    Effect.succeed(
      SessionHistoryUnavailable.make({
        protocolVersion: 4,
        sessionId,
        code: "history-unavailable",
        message: "PackWalk could not read its retained session history",
      }),
    ),
): Effect.Effect<never, LocalIpcError> =>
  server
    .run((socket) =>
      serveClient(socket, events, refresh, inspectHistoryPage).pipe(
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
  Stream.Stream<SessionProtocolEventValue, LocalIpcError>,
  LocalIpcError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const socket = yield* NodeSocket.makeNet({
      path: endpoint,
      openTimeout: "1 second",
    })
    const queue = yield* Queue.bounded<
      SessionProtocolEventValue,
      LocalIpcError | Cause.Done
    >(16)
    const opened = yield* Deferred.make<void, LocalIpcError>()
    const decodeFrames = yield* frameDecoder(MaximumSessionEventBytes)
    const write = yield* socket.writer
    const request = yield* Schema.encodeEffect(SessionCommandJson)(
      SessionCommand.cases.SubscribeSessions.make({ protocolVersion: 4 }),
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
              Schema.decodeUnknownEffect(SessionProtocolEventJson, {
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

const querySessionHistoryPage = (
  endpoint: string,
  sessionId: SessionIdentityValue,
  cursor: SessionHistoryCursorValue | null,
): Effect.Effect<SessionHistoryProtocolResponse, LocalIpcError, Scope.Scope> =>
  Effect.gen(function* () {
    const socket = yield* NodeSocket.makeNet({
      path: endpoint,
      openTimeout: "1 second",
    })
    const queue = yield* Queue.bounded<
      SessionHistoryProtocolResponse,
      LocalIpcError | Cause.Done
    >(1)
    const opened = yield* Deferred.make<void, LocalIpcError>()
    const decodeFrames = yield* frameDecoder(MaximumSessionEventBytes)
    const write = yield* socket.writer
    const request = yield* Schema.encodeEffect(SessionCommandJson)(
      SessionCommand.cases.InspectSessionHistory.make({
        protocolVersion: 4,
        sessionId,
        cursor,
      }),
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
              Schema.decodeUnknownEffect(SessionHistoryProtocolResponseJson, {
                onExcessProperty: "error",
              })(line).pipe(
                Effect.mapError(() =>
                  ipcError(
                    "invalid-frame",
                    "PackWalk received an invalid session history response",
                  ),
                ),
                Effect.flatMap((response) => Queue.offer(queue, response)),
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

    return yield* Stream.fromQueue(queue).pipe(
      Stream.runHead,
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              ipcError(
                "connection-unavailable",
                "PackWalk lost its local session connection",
              ),
            ),
          onSome: Effect.succeed,
        }),
      ),
    )
  })

export const inspectSessionHistory = Effect.fn("LocalSessionIpc.inspectHistory")(
  function* (
    endpoint: string,
    sessionId: SessionIdentityValue,
  ) {
    let cursor: SessionHistoryCursorValue | null = null
    let explainedView: SessionView | undefined
    let historyCoverage: SessionHistoryCoverage | undefined
    let throughCommitSequence: number | undefined
    const facts: Array<SessionEvidenceFact> = []

    while (true) {
      const response = yield* Effect.scoped(
        querySessionHistoryPage(endpoint, sessionId, cursor),
      )
      if (response._tag === "SessionHistoryUnavailable") return response

      const expectedAfter = cursor?.afterCommitSequence ?? 0
      if (
        response.afterCommitSequence !== expectedAfter ||
        (throughCommitSequence !== undefined &&
          response.throughCommitSequence !== throughCommitSequence) ||
        (explainedView !== undefined &&
          JSON.stringify(response.explainedView) !== JSON.stringify(explainedView)) ||
        (historyCoverage !== undefined &&
          response.historyCoverage !== historyCoverage)
      ) {
        return yield* ipcError(
          "invalid-frame",
          "PackWalk received an invalid session history response",
        )
      }

      explainedView ??= response.explainedView
      historyCoverage ??= response.historyCoverage
      throughCommitSequence ??= response.throughCommitSequence
      facts.push(...response.facts)

      if (response.nextAfterCommitSequence === null) {
        return yield* Schema.decodeUnknownEffect(SessionHistory, {
          onExcessProperty: "error",
        })({
          _tag: "SessionHistory",
          protocolVersion: 4,
          sessionId,
          explainedView,
          historyCoverage,
          omittedContent: response.omittedContent,
          unsupportedFacts: response.unsupportedFacts,
          facts,
        }).pipe(
          Effect.mapError(() =>
            ipcError(
              "invalid-frame",
              "PackWalk received an invalid session history response",
            ),
          ),
        )
      }

      cursor = SessionHistoryCursor.make({
        afterCommitSequence: response.nextAfterCommitSequence,
        throughCommitSequence: response.throughCommitSequence,
      })
    }
  },
)

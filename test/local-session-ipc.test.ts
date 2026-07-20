import { mkdtempSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Result, Stream } from "effect"
import { TestClock } from "effect/testing"

import {
  connectSessionEvents,
  inspectSessionHistory,
  makeSessionEventServer,
  runSessionEventServer,
} from "../src/adapters/local-session-ipc.js"
import { connectOrStart } from "../src/application/cli-startup.js"
import {
  MaximumSessionEventBytes,
  ProjectIdentity,
  SessionEvidenceOrigin,
  SessionEvent,
  SessionHistoryPage,
  SessionHistoryUnavailable,
  SessionIdentity,
  SessionProvenance,
  SessionState,
  SessionView,
  sessionHistoryOmittedContent,
  sessionHistoryUnsupportedFacts,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const view = SessionView.make({
  protocolVersion: 2,
  sessionId: SessionIdentity.make(sessionId),
  projectIdentity: ProjectIdentity.make("fixture-project"),
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: SessionState.cases.Discovered.make({}),
  freshness: "fresh",
  provenance: SessionProvenance.cases.Observed.make({}),
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
})

const effectError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error("Unexpected local IPC test failure")

const makeEndpoint = (directory: string): string =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\packwalk-ipc-test-${randomUUID()}`
    : join(directory, "daemon.sock")

const closeServer = (server: Server): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise<void>((resolve) => {
        if (!server.listening) {
          resolve()
          return
        }
        server.close(() => resolve())
      }),
  )

const makeRawEventServer = (
  endpoint: string,
  chunks: ReadonlyArray<Uint8Array>,
  onRequest: () => void = () => undefined,
): Effect.Effect<Server, Error, import("effect").Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const sockets = new Set<Socket>()
        const server = createServer((socket) => {
          sockets.add(socket)
          socket.once("close", () => sockets.delete(socket))
          socket.once("data", () => {
            onRequest()
            const send = (index: number): void => {
              const chunk = chunks[index]
              if (chunk === undefined) {
                if (chunks.length > 0) socket.end()
                return
              }
              socket.write(chunk, () => setTimeout(() => send(index + 1), 5))
            }
            send(0)
          })
        })
        server.once("close", () => {
          for (const socket of sockets) socket.destroy()
        })
        const listening = once(server, "listening")
        server.listen(endpoint)
        await listening
        return server
      },
      catch: effectError,
    }),
    closeServer,
  )

const makeSequentialRawServer = (
  endpoint: string,
  frames: ReadonlyArray<Uint8Array>,
): Effect.Effect<Server, Error, import("effect").Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const sockets = new Set<Socket>()
        let connectionIndex = 0
        const server = createServer((socket) => {
          sockets.add(socket)
          const frame = frames[connectionIndex]
          connectionIndex += 1
          socket.once("close", () => sockets.delete(socket))
          socket.once("data", () => {
            if (frame === undefined) {
              socket.end()
              return
            }
            socket.end(frame)
          })
        })
        server.once("close", () => {
          for (const socket of sockets) socket.destroy()
        })
        const listening = once(server, "listening")
        server.listen(endpoint)
        await listening
        return server
      },
      catch: effectError,
    }),
    closeServer,
  )

const openRawClient = (
  endpoint: string,
): Effect.Effect<Socket, Error, import("effect").Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => {
        const socket = createConnection(endpoint)
        await once(socket, "connect")
        return socket
      },
      catch: effectError,
    }),
    (socket) => Effect.sync(() => socket.destroy()),
  )

const waitForSocketClose = (socket: Socket): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      if (socket.closed) return
      await once(socket, "close")
    },
    catch: effectError,
  }).pipe(
    Effect.timeoutOrElse({
      duration: "1 second",
      orElse: () => Effect.fail(new Error("Local IPC peer did not close")),
    }),
  )

const receiveOneEvent = (endpoint: string) =>
  connectSessionEvents(endpoint).pipe(
    Effect.flatMap((events) =>
      events.pipe(Stream.take(1), Stream.runCollect),
    ),
  )

const snapshotBytes = (projectIdentity: string): Uint8Array =>
  Buffer.from(
    `${JSON.stringify(
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 4,
        views: [
          SessionView.make({
            ...view,
            projectIdentity: ProjectIdentity.make(projectIdentity),
          }),
        ],
      }),
    )}\n`,
    "utf8",
  )

const legacyViewV1 = {
  protocolVersion: 1,
  sessionId,
  projectIdentity: "fixture-project",
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: { _tag: "Discovered" },
  freshness: "fresh",
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
} as const

const legacySingletonSnapshotBytes = (): Uint8Array =>
  Buffer.from(
    `${JSON.stringify({
      _tag: "SessionSnapshot",
      protocolVersion: 1,
      view: legacyViewV1,
    })}\n`,
    "utf8",
  )

const legacyOverviewSnapshotBytes = (): Uint8Array =>
  Buffer.from(
    `${JSON.stringify({
      _tag: "SessionsSnapshot",
      protocolVersion: 2,
      views: [legacyViewV1],
    })}\n`,
    "utf8",
  )

it.effect("encodes and decodes the public session event stream across local IPC", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const events = Stream.make(
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 4,
        views: [view],
      }),
      SessionEvent.cases.SessionsUpdated.make({
        protocolVersion: 4,
        views: [
          SessionView.make({
            ...view,
            state: SessionState.cases.Polled.make({}),
            sourceUpdatedAtMs: 2_500,
            observedAtMs: 3_000,
            commitSequence: 2,
          }),
        ],
        changedSessionIds: [SessionIdentity.make(sessionId)],
      }),
    )

    const server = yield* makeSessionEventServer(endpoint)
    yield* runSessionEventServer(server, events).pipe(Effect.forkScoped)

    const received = yield* connectSessionEvents(endpoint).pipe(
      Effect.flatMap((stream) => stream.pipe(Stream.take(2), Stream.runCollect)),
      Effect.forkChild,
    )

    expect(Array.from(yield* Fiber.join(received))).toEqual(
      Array.from(yield* Stream.runCollect(events)),
    )
  }),
)

it.effect("keeps an accepting endpoint under the deadline until its first overview", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    let resolveRequest = (): void => undefined
    const requestReceived = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    yield* makeRawEventServer(endpoint, [], resolveRequest)

    const connected = yield* connectOrStart({
      connect: connectSessionEvents(endpoint),
      startDaemon: Effect.die("An accepting endpoint must not start a daemon"),
      retryDelay: "100 millis",
      retryAttempts: 300,
      startupDeadline: "250 millis",
    }).pipe(Effect.result, Effect.forkChild)

    yield* Effect.promise(() => requestReceived)
    expect(connected.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust("249 millis")
    expect(connected.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust("1 milli")

    const result = yield* Fiber.join(connected)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "PackWalk.CliStartupError",
        reason: "startup-deadline-exceeded",
      })
    }
  }),
)

it.effect("rejects a crossed unavailable history response", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const crossed = SessionHistoryUnavailable.make({
      protocolVersion: 4,
      sessionId: SessionIdentity.make("019f77d2-1a10-7cf0-b5df-76eebb4071ac"),
      code: "session-not-found",
      message: "PackWalk has no retained history for that exact session",
    })
    yield* makeSequentialRawServer(endpoint, [
      Buffer.from(`${JSON.stringify(crossed)}\n`, "utf8"),
    ])

    const result = yield* Effect.scoped(
      inspectSessionHistory(endpoint, SessionIdentity.make(sessionId)),
    ).pipe(Effect.result)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "PackWalk.LocalIpcError",
        code: "invalid-frame",
      })
    }
  }),
)

it.effect("rejects a crossed unavailable history continuation", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const explainedView = SessionView.make({
      ...view,
      state: SessionState.cases.Polled.make({}),
      sourceUpdatedAtMs: 2_500,
      observedAtMs: 3_000,
      commitSequence: 2,
    })
    const firstPage = SessionHistoryPage.make({
      protocolVersion: 4,
      sessionId: SessionIdentity.make(sessionId),
      explainedView,
      historyCoverage: "complete",
      omittedContent: sessionHistoryOmittedContent,
      unsupportedFacts: sessionHistoryUnsupportedFacts,
      facts: [{
        factVersion: 1,
        origin: SessionEvidenceOrigin.cases.Committed.make({
          recordedAtMs: 2_000,
        }),
        view,
      }],
      afterCommitSequence: 0,
      throughCommitSequence: 2,
      nextAfterCommitSequence: 1,
    })
    const crossed = SessionHistoryUnavailable.make({
      protocolVersion: 4,
      sessionId: SessionIdentity.make("019f77d2-1a10-7cf0-b5df-76eebb4071ac"),
      code: "invalid-history-cursor",
      message: "PackWalk could not continue that retained session history query",
    })
    yield* makeSequentialRawServer(endpoint, [
      Buffer.from(`${JSON.stringify(firstPage)}\n`, "utf8"),
      Buffer.from(`${JSON.stringify(crossed)}\n`, "utf8"),
    ])

    const result = yield* Effect.scoped(
      inspectSessionHistory(endpoint, SessionIdentity.make(sessionId)),
    ).pipe(Effect.result)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "PackWalk.LocalIpcError",
        code: "invalid-frame",
      })
    }
  }),
)

it.live("rejects malformed UTF-8 in a session event instead of replacing bytes", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const marker = "malformed-project-marker"
    const encoded = snapshotBytes(marker)
    const markerOffset = Buffer.from(encoded).indexOf(marker)
    const malformed = Buffer.concat([
      encoded.subarray(0, markerOffset),
      Uint8Array.of(0xc3, 0x28),
      encoded.subarray(markerOffset + Buffer.byteLength(marker, "utf8")),
    ])

    yield* makeRawEventServer(endpoint, [malformed])
    const result = yield* connectSessionEvents(endpoint).pipe(
      Effect.flatMap((events) => Stream.runCollect(events)),
      Effect.result,
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "PackWalk.LocalIpcError",
        code: "invalid-frame",
      })
      expect(result.failure.message).toBe(
        "PackWalk received an invalid IPC frame",
      )
    }
  }),
)

it.live("rejects a legacy singleton event on the protocol-v4 client", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)

    yield* makeRawEventServer(endpoint, [legacySingletonSnapshotBytes()])
    const result = yield* receiveOneEvent(endpoint).pipe(Effect.result)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "PackWalk.LocalIpcError",
        code: "invalid-frame",
        message: "PackWalk received an invalid session event",
      })
    }
  }),
)

it.live("rejects a raw protocol-v2 overview event on the protocol-v4 client", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)

    yield* makeRawEventServer(endpoint, [legacyOverviewSnapshotBytes()])
    const result = yield* receiveOneEvent(endpoint).pipe(Effect.result)

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "PackWalk.LocalIpcError",
        code: "invalid-frame",
        message: "PackWalk received an invalid session event",
      })
    }
  }),
)

it.live("preserves a UTF-8 code point split across IPC chunks", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const projectIdentity = "fixture-€-project"
    const encoded = snapshotBytes(projectIdentity)
    const codePoint = Buffer.from("€", "utf8")
    const codePointOffset = Buffer.from(encoded).indexOf(codePoint)

    yield* makeRawEventServer(endpoint, [
      encoded.subarray(0, codePointOffset + 1),
      encoded.subarray(codePointOffset + 1),
    ])
    const received = Array.from(yield* receiveOneEvent(endpoint))

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      protocolVersion: 4,
      views: [{ projectIdentity }],
    })
  }),
)

it.live("rejects an oversized IPC frame before its newline arrives", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)

    yield* makeRawEventServer(endpoint, [
      Buffer.alloc(MaximumSessionEventBytes + 1, 0x61),
    ])
    const result = yield* receiveOneEvent(endpoint).pipe(Effect.result)

    expect(Result.isFailure(result)).toBe(true)
  }),
)

it.live("continues serving after a peer disconnects before subscribing", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const events = Stream.make(
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 4,
        views: [view],
      }),
    )
    const server = yield* makeSessionEventServer(endpoint)
    yield* runSessionEventServer(server, events).pipe(Effect.forkScoped)
    const peer = yield* openRawClient(endpoint)

    const closed = waitForSocketClose(peer)
    peer.end()
    yield* closed

    expect(Array.from(yield* receiveOneEvent(endpoint))).toHaveLength(1)
  }),
)

it.live("closes a malformed-command peer and continues serving", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const events = Stream.make(
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 4,
        views: [view],
      }),
    )
    const server = yield* makeSessionEventServer(endpoint)
    yield* runSessionEventServer(server, events).pipe(Effect.forkScoped)
    const peer = yield* openRawClient(endpoint)

    const closed = waitForSocketClose(peer)
    peer.write('{"_tag":"UnknownCommand","protocolVersion":1}\n')
    yield* closed

    expect(Array.from(yield* receiveOneEvent(endpoint))).toHaveLength(1)
  }),
)

it.live("rejects a protocol-v2 subscription without emitting a v4 event", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ipc-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = makeEndpoint(directory)
    const events = Stream.make(
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 4,
        views: [view],
      }),
    )
    const server = yield* makeSessionEventServer(endpoint)
    yield* runSessionEventServer(server, events).pipe(Effect.forkScoped)
    const peer = yield* openRawClient(endpoint)
    let receivedData = false
    peer.once("data", () => {
      receivedData = true
    })

    const closed = waitForSocketClose(peer)
    peer.write('{"_tag":"SubscribeSessions","protocolVersion":2}\n')
    yield* closed

    expect(receivedData).toBe(false)
    expect(Array.from(yield* receiveOneEvent(endpoint))).toHaveLength(1)
  }),
)

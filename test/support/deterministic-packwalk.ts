import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { Context, Effect, Layer, Ref, Schema, Scope, Stream } from "effect"

import {
  Service as SessionStorage,
  SessionStorageError,
} from "../../src/application/session-storage.js"
import {
  Service as SessionSource,
  SessionSourceError,
  type Interface as SessionSourceInterface,
} from "../../src/application/session-source.js"
import { layer as sqliteSessionStorageLayer } from "../../src/adapters/sqlite-session-storage.js"
import {
  connectSessionEvents,
  LocalIpcError,
} from "../../src/adapters/local-session-ipc.js"
import {
  sessionDaemonLayer,
  Service as SessionDaemon,
  type SessionDaemonFailure,
} from "../../src/daemon/session-runtime.js"
import {
  CodexPersistedFact,
  SessionIdentity,
  type SessionEvent,
} from "../../src/domain/session.js"

export interface DeterministicPackWalk {
  readonly events: Stream.Stream<SessionEvent, LocalIpcError>
  readonly lifetime: Effect.Effect<never, SessionDaemonFailure>
  readonly persistSourceUpdate: (update: {
    readonly sourceUpdatedAtMs: number
  }) => Effect.Effect<void, SessionSourceError>
  readonly persistSourceIdentityForTest: (
    sessionId: string,
  ) => Effect.Effect<void, SessionSourceError>
  readonly persistSourceFactForTest: (
    fact: unknown,
  ) => Effect.Effect<void>
  readonly loseSourceForTest: Effect.Effect<void>
}

export interface DeterministicPackWalkOptions {
  readonly failCommitSequence?: number
}

const decodeFact = (input: unknown) =>
  Schema.decodeUnknownEffect(CodexPersistedFact, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(
      () =>
        new SessionSourceError({
          code: "invalid-evidence",
          message: "Codex persisted evidence is incompatible",
        }),
    ),
  )

export const makeDeterministicPackWalk = (
  initial: unknown,
  options: DeterministicPackWalkOptions = {},
): Effect.Effect<DeterministicPackWalk, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const factRef = yield* Ref.make<unknown>(initial)
    const sourceAvailable = yield* Ref.make(true)
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )

    const read = Effect.fn("SessionSource.Test.read")(function* () {
      return yield* Ref.get(factRef).pipe(Effect.flatMap(decodeFact))
    })

    const source: SessionSourceInterface = {
      discover: read,
      poll: () =>
        Ref.get(sourceAvailable).pipe(
          Effect.flatMap((available) =>
            available
              ? read()
              : Effect.fail(
                  new SessionSourceError({
                    code: "unavailable",
                    message: "Codex persisted evidence is unavailable",
                  }),
                ),
          ),
        ),
    }

    const sourceLayer = Layer.succeed(SessionSource, SessionSource.of(source))
    const realStorageLayer = sqliteSessionStorageLayer(join(directory, "packwalk.sqlite"))
    const storageLayer =
      options.failCommitSequence === undefined
        ? realStorageLayer
        : Layer.effect(
            SessionStorage,
            Effect.gen(function* () {
              const storage = yield* SessionStorage
              return SessionStorage.of({
                load: storage.load,
                commit: (view) =>
                  view.commitSequence === options.failCommitSequence
                    ? Effect.fail(
                        new SessionStorageError({
                          operation: "SessionStorage.commit",
                          message: "PackWalk could not commit its current session view",
                        }),
                      )
                    : storage.commit(view),
              })
            }),
          ).pipe(Layer.provide(realStorageLayer))
    const dependencies = Layer.mergeAll(
      sourceLayer,
      storageLayer,
    )
    const endpoint =
      process.platform === "win32"
        ? `\\\\.\\pipe\\packwalk-test-${randomUUID()}`
        : join(directory, "daemon.sock")
    const daemonContext = yield* Layer.build(
      sessionDaemonLayer(endpoint).pipe(Layer.provide(dependencies)),
    )
    const daemon = Context.get(daemonContext, SessionDaemon)

    const persistSourceUpdate = Effect.fn("SessionSource.Test.persistUpdate")(
      function* (update: { readonly sourceUpdatedAtMs: number }) {
        const fact = yield* Ref.get(factRef).pipe(Effect.flatMap(decodeFact))
        yield* Ref.set(
          factRef,
          CodexPersistedFact.make({
            ...fact,
            sourceUpdatedAtMs: update.sourceUpdatedAtMs,
          }),
        )
      },
    )

    const persistSourceIdentityForTest = Effect.fn(
      "SessionSource.Test.persistIdentity",
    )(function* (sessionId: string) {
      const fact = yield* Ref.get(factRef).pipe(Effect.flatMap(decodeFact))
      yield* Ref.set(
        factRef,
        CodexPersistedFact.make({
          ...fact,
          sessionId: SessionIdentity.make(sessionId),
          sourceUpdatedAtMs: fact.sourceUpdatedAtMs + 1,
        }),
      )
    })

    return {
      events: Stream.unwrap(connectSessionEvents(endpoint)),
      lifetime: daemon.lifetime,
      persistSourceUpdate,
      persistSourceIdentityForTest,
      persistSourceFactForTest: (fact) => Ref.set(factRef, fact),
      loseSourceForTest: Ref.set(sourceAvailable, false),
    }
  })

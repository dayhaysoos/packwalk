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
  sameSessionIdentity,
  SessionIdentity,
  type SessionEvent,
} from "../../src/domain/session.js"

interface SourceUpdate {
  readonly sourceUpdatedAtMs: number
}

interface PersistSourceUpdate {
  (update: SourceUpdate): Effect.Effect<void, SessionSourceError>
  (
    sessionId: string,
    update: SourceUpdate,
  ): Effect.Effect<void, SessionSourceError>
}

export interface DeterministicPackWalk {
  readonly events: Stream.Stream<SessionEvent, LocalIpcError>
  readonly lifetime: Effect.Effect<never, SessionDaemonFailure>
  readonly persistSourceUpdate: PersistSourceUpdate
  readonly persistSourceIdentityForTest: (
    sessionId: string,
  ) => Effect.Effect<void, SessionSourceError>
  readonly persistSourceFactForTest: (
    fact: unknown,
  ) => Effect.Effect<void>
  readonly loseSourceForTest: Effect.Effect<void>
  readonly restoreSourceForTest: Effect.Effect<void>
  readonly loseExactSourceForTest: (
    sessionId: string,
  ) => Effect.Effect<void, SessionSourceError>
  readonly restoreExactSourceForTest: (
    sessionId: string,
  ) => Effect.Effect<void>
}

export interface RestartableDeterministicPackWalk {
  readonly events: Stream.Stream<SessionEvent, LocalIpcError>
  readonly startDaemonIn: (
    scope: Scope.Scope,
  ) => Effect.Effect<Effect.Effect<never, SessionDaemonFailure>, unknown>
  readonly persistSourceUpdate: PersistSourceUpdate
  readonly persistSourceIdentityForTest: (
    sessionId: string,
  ) => Effect.Effect<void, SessionSourceError>
  readonly persistSourceFactForTest: (
    fact: unknown,
  ) => Effect.Effect<void>
  readonly loseSourceForTest: Effect.Effect<void>
  readonly restoreSourceForTest: Effect.Effect<void>
  readonly loseExactSourceForTest: (
    sessionId: string,
  ) => Effect.Effect<void, SessionSourceError>
  readonly restoreExactSourceForTest: (
    sessionId: string,
  ) => Effect.Effect<void>
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

const sourceError = (
  code: "unavailable" | "invalid-evidence" | "ambiguous",
): SessionSourceError =>
  new SessionSourceError({
    code,
    message:
      code === "unavailable"
        ? "Codex persisted evidence is unavailable"
        : code === "ambiguous"
          ? "Codex persisted evidence is ambiguous"
        : "Codex persisted evidence is incompatible",
  })

const asFactInputs = (input: unknown): ReadonlyArray<unknown> =>
  Array.isArray(input) ? input : [input]

export const makeRestartableDeterministicPackWalk = (
  initial: unknown,
  options: DeterministicPackWalkOptions = {},
): Effect.Effect<
  RestartableDeterministicPackWalk,
  unknown,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const factRef = yield* Ref.make<ReadonlyArray<unknown>>(
      asFactInputs(initial),
    )
    const violateExactPollIdentityForTest = yield* Ref.make(false)
    const sourceAvailable = yield* Ref.make(true)
    const unavailableSessionIds = yield* Ref.make<ReadonlySet<string>>(
      new Set(),
    )
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )

    const readAll = Effect.fn("SessionSource.Test.readAll")(function* () {
      const facts = yield* Ref.get(factRef).pipe(
        Effect.flatMap((inputs) => Effect.forEach(inputs, decodeFact)),
      )
      const first = facts[0]
      if (first === undefined) return yield* sourceError("invalid-evidence")
      return [first, ...facts.slice(1)] as const
    })

    const requireAvailable = Effect.fn("SessionSource.Test.requireAvailable")(
      function* <A, E, R>(effect: Effect.Effect<A, E, R>) {
        const available = yield* Ref.get(sourceAvailable)
        if (!available) return yield* sourceError("unavailable")
        return yield* effect
      },
    )

    const readExact = Effect.fn("SessionSource.Test.readExact")(function* (
      sessionId: typeof SessionIdentity.Type,
    ) {
      const matches = (yield* readAll()).filter((fact) =>
        sameSessionIdentity(fact.sessionId, sessionId),
      )
      if (matches.length === 0) {
        const violateExactIdentity = yield* Ref.get(
          violateExactPollIdentityForTest,
        )
        const mismatchedFact = (yield* readAll())[0]
        if (violateExactIdentity && mismatchedFact !== undefined) {
          return mismatchedFact
        }
        return yield* sourceError("unavailable")
      }
      if (matches.length > 1) return yield* sourceError("ambiguous")
      const match = matches[0]
      if (match === undefined) {
        return yield* sourceError("invalid-evidence")
      }
      return match
    })

    const discover = Effect.fn("SessionSource.Test.discover")(function* () {
      const facts = yield* readAll()
      const unavailable = yield* Ref.get(unavailableSessionIds)
      const available = facts.filter((fact) => !unavailable.has(fact.sessionId))
      const first = available[0]
      if (first === undefined) return yield* sourceError("unavailable")
      return [first, ...available.slice(1)] as const
    })

    const poll = Effect.fn("SessionSource.Test.poll")(function* (
      sessionId: typeof SessionIdentity.Type,
    ) {
      const unavailable = yield* Ref.get(unavailableSessionIds)
      if (unavailable.has(sessionId)) return yield* sourceError("unavailable")
      return yield* readExact(sessionId)
    })

    const source: SessionSourceInterface = {
      discover: () => requireAvailable(discover()),
      poll: (sessionId) => requireAvailable(poll(sessionId)),
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
                commit: (expectedPreviousCommitSequence, changedViews) =>
                  changedViews.some(
                    (view) =>
                      view.commitSequence === options.failCommitSequence,
                  )
                    ? Effect.fail(
                        new SessionStorageError({
                          operation: "SessionStorage.commit",
                          message: "PackWalk could not commit its current session view",
                        }),
                      )
                    : storage.commit(
                        expectedPreviousCommitSequence,
                        changedViews,
                      ),
              })
            }),
          ).pipe(Layer.provide(realStorageLayer))
    const endpoint =
      process.platform === "win32"
        ? `\\\\.\\pipe\\packwalk-test-${randomUUID()}`
        : join(directory, "daemon.sock")
    const startDaemonIn = Effect.fn("PackWalkTest.startDaemonIn")(
      function* (scope: Scope.Scope) {
        const dependencies = Layer.mergeAll(sourceLayer, storageLayer)
        const daemonContext = yield* Layer.buildWithScope(
          sessionDaemonLayer(endpoint).pipe(Layer.provide(dependencies)),
          scope,
        )
        return Context.get(daemonContext, SessionDaemon).lifetime
      },
    )

    const persistSourceUpdate: PersistSourceUpdate = (
      sessionIdOrUpdate: string | SourceUpdate,
      exactUpdate?: SourceUpdate,
    ) =>
      Effect.gen(function* () {
        const facts = yield* readAll()
        const update =
          typeof sessionIdOrUpdate === "string"
            ? exactUpdate
            : sessionIdOrUpdate
        if (update === undefined) return yield* sourceError("invalid-evidence")

        const sessionId =
          typeof sessionIdOrUpdate === "string"
            ? sessionIdOrUpdate
            : facts.length === 1
              ? facts[0]?.sessionId
              : undefined
        if (sessionId === undefined) {
          return yield* sourceError(
            facts.length > 1 ? "ambiguous" : "invalid-evidence",
          )
        }

        const matches = facts.filter((fact) =>
          sameSessionIdentity(fact.sessionId, sessionId),
        )
        if (matches.length !== 1) {
          return yield* sourceError(
            matches.length > 1 ? "ambiguous" : "invalid-evidence",
          )
        }

        yield* Ref.set(
          factRef,
          facts.map((fact) =>
            sameSessionIdentity(fact.sessionId, sessionId)
              ? CodexPersistedFact.make({
                  ...fact,
                  sourceUpdatedAtMs: update.sourceUpdatedAtMs,
                })
              : fact,
          ),
        )
      })

    const persistSourceIdentityForTest = Effect.fn(
      "SessionSource.Test.persistIdentity",
    )(function* (sessionId: string) {
      const facts = yield* readAll()
      const fact = facts.length === 1 ? facts[0] : undefined
      if (fact === undefined) return yield* sourceError("invalid-evidence")
      yield* Ref.set(
        factRef,
        [
          CodexPersistedFact.make({
            ...fact,
            sessionId: SessionIdentity.make(sessionId),
            sourceUpdatedAtMs: fact.sourceUpdatedAtMs + 1,
          }),
        ],
      )
      yield* Ref.set(violateExactPollIdentityForTest, true)
    })

    const loseExactSourceForTest = Effect.fn(
      "SessionSource.Test.loseExact",
    )(function* (sessionId: string) {
      const facts = yield* readAll()
      if (!facts.some((fact) => sameSessionIdentity(fact.sessionId, sessionId))) {
        return yield* sourceError("invalid-evidence")
      }
      yield* Ref.update(
        unavailableSessionIds,
        (current) => new Set([...current, sessionId]),
      )
    })
    const restoreExactSourceForTest = (sessionId: string) =>
      Ref.update(unavailableSessionIds, (current) => {
        const next = new Set(current)
        next.delete(sessionId)
        return next
      })
    return {
      events: Stream.unwrap(connectSessionEvents(endpoint)),
      startDaemonIn,
      persistSourceUpdate,
      persistSourceIdentityForTest,
      persistSourceFactForTest: (fact) =>
        Ref.set(factRef, asFactInputs(fact)),
      loseSourceForTest: Ref.set(sourceAvailable, false),
      restoreSourceForTest: Ref.set(sourceAvailable, true),
      loseExactSourceForTest,
      restoreExactSourceForTest,
    }
  })

export const makeDeterministicPackWalk = (
  initial: unknown,
  options: DeterministicPackWalkOptions = {},
): Effect.Effect<DeterministicPackWalk, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const fixture = yield* makeRestartableDeterministicPackWalk(
      initial,
      options,
    )
    const scope = yield* Scope.Scope
    const lifetime = yield* fixture.startDaemonIn(scope)
    return { ...fixture, lifetime }
  })

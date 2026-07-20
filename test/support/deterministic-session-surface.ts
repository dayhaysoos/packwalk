import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Context, Effect, Layer, Ref, Scope, Stream } from "effect"

import { layer as sqliteSessionStorageLayer } from "../../src/adapters/sqlite-session-storage.js"
import {
  Service as SessionSource,
  SessionSourceError,
  type Interface as SessionSourceInterface,
} from "../../src/application/session-source.js"
import {
  layer as sessionSurfaceLayer,
  Service as SessionSurface,
} from "../../src/application/session-surface.js"
import {
  Service as SessionStorage,
  type Interface as SessionStorageInterface,
} from "../../src/application/session-storage.js"
import {
  CodexPersistedFact,
  sameSessionIdentity,
  SessionIdentity,
  SessionView,
  type SessionEvent,
} from "../../src/domain/session.js"

interface PersistSourceUpdate {
  (sourceUpdatedAtMs: number): Effect.Effect<void, SessionSourceError>
  (
    sessionId: string,
    sourceUpdatedAtMs: number,
  ): Effect.Effect<void, SessionSourceError>
}

export interface DeterministicSessionSurface {
  readonly events: Stream.Stream<SessionEvent>
  readonly persistSourceUpdate: PersistSourceUpdate
}

export interface DeterministicSessionSurfaceOptions {
  readonly restored?: SessionView | ReadonlyArray<SessionView>
}

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

const isFactArray = (
  input: CodexPersistedFact | ReadonlyArray<CodexPersistedFact>,
): input is ReadonlyArray<CodexPersistedFact> => Array.isArray(input)

const asFacts = (
  input: CodexPersistedFact | ReadonlyArray<CodexPersistedFact>,
): ReadonlyArray<CodexPersistedFact> =>
  isFactArray(input) ? input : [input]

const isViewArray = (
  input: SessionView | ReadonlyArray<SessionView>,
): input is ReadonlyArray<SessionView> => Array.isArray(input)

const asViews = (
  input: SessionView | ReadonlyArray<SessionView>,
): ReadonlyArray<SessionView> =>
  isViewArray(input) ? input : [input]

const seedRestoredViews = Effect.fn("SessionStorage.SurfaceTest.seed")(
  function* (
    storage: SessionStorageInterface,
    restoredViews: ReadonlyArray<SessionView>,
  ) {
    const ordered = [...restoredViews].sort(
      (left, right) => left.commitSequence - right.commitSequence,
    )
    let lastCommitSequence = 0

    for (const view of ordered) {
      if (view.commitSequence <= lastCommitSequence) {
        return yield* Effect.fail(
          new Error("Restored fixture commit sequences must be globally unique"),
        )
      }

      for (
        let commitSequence = lastCommitSequence + 1;
        commitSequence <= view.commitSequence;
        commitSequence += 1
      ) {
        yield* storage.commit(lastCommitSequence, [
          SessionView.make({ ...view, commitSequence }),
        ])
        lastCommitSequence = commitSequence
      }
    }
  },
)

export const makeDeterministicSessionSurface = (
  initial: CodexPersistedFact | ReadonlyArray<CodexPersistedFact>,
  options: DeterministicSessionSurfaceOptions = {},
): Effect.Effect<DeterministicSessionSurface, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const factRef = yield* Ref.make(asFacts(initial))
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-surface-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const readAll = Effect.fn("SessionSource.SurfaceTest.readAll")(
      function* () {
        const facts = yield* Ref.get(factRef)
        const first = facts[0]
        if (first === undefined) return yield* sourceError("invalid-evidence")
        return [first, ...facts.slice(1)] as const
      },
    )
    const readExact = Effect.fn("SessionSource.SurfaceTest.readExact")(
      function* (sessionId: typeof SessionIdentity.Type) {
        const matches = (yield* readAll()).filter((fact) =>
          sameSessionIdentity(fact.sessionId, sessionId),
        )
        if (matches.length === 0) return yield* sourceError("unavailable")
        if (matches.length > 1) return yield* sourceError("ambiguous")
        const match = matches[0]
        if (match === undefined) {
          return yield* sourceError("invalid-evidence")
        }
        return match
      },
    )
    const source: SessionSourceInterface = {
      discover: readAll,
      poll: readExact,
    }
    const persistSourceUpdate: PersistSourceUpdate = (
      sessionIdOrTimestamp: string | number,
      exactTimestamp?: number,
    ) =>
      Effect.gen(function* () {
        const facts = yield* readAll()
        const sessionId =
          typeof sessionIdOrTimestamp === "string"
            ? sessionIdOrTimestamp
            : facts.length === 1
              ? facts[0]?.sessionId
              : undefined
        const sourceUpdatedAtMs =
          typeof sessionIdOrTimestamp === "string"
            ? exactTimestamp
            : sessionIdOrTimestamp
        if (sessionId === undefined || sourceUpdatedAtMs === undefined) {
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
              ? CodexPersistedFact.make({ ...fact, sourceUpdatedAtMs })
              : fact,
          ),
        )
      })
    const storagePath = join(directory, "packwalk.sqlite")
    const restored = options.restored
    if (restored !== undefined) {
      const restoredViews = asViews(restored)
      yield* Effect.scoped(
        Effect.gen(function* () {
          const storageContext = yield* Layer.build(
            sqliteSessionStorageLayer(storagePath),
          )
          yield* seedRestoredViews(
            Context.get(storageContext, SessionStorage),
            restoredViews,
          )
        }),
      )
    }
    const dependencies = Layer.mergeAll(
      Layer.succeed(SessionSource, SessionSource.of(source)),
      sqliteSessionStorageLayer(storagePath),
    )
    const context = yield* Layer.build(
      sessionSurfaceLayer.pipe(Layer.provide(dependencies)),
    )
    const surface = Context.get(context, SessionSurface)
    yield* surface.runPolling.pipe(Effect.forkScoped)

    return {
      events: surface.events,
      persistSourceUpdate,
    }
  })

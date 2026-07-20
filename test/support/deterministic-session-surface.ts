import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Context, Effect, Layer, Ref, Scope, Stream } from "effect"

import { layer as sqliteSessionStorageLayer } from "../../src/adapters/sqlite-session-storage.js"
import {
  Service as SessionSource,
  type Interface as SessionSourceInterface,
} from "../../src/application/session-source.js"
import {
  layer as sessionSurfaceLayer,
  Service as SessionSurface,
} from "../../src/application/session-surface.js"
import { Service as SessionStorage } from "../../src/application/session-storage.js"
import {
  CodexPersistedFact,
  type SessionEvent,
  type SessionView,
} from "../../src/domain/session.js"

export interface DeterministicSessionSurface {
  readonly events: Stream.Stream<SessionEvent>
  readonly persistSourceUpdate: (
    sourceUpdatedAtMs: number,
  ) => Effect.Effect<void>
}

export interface DeterministicSessionSurfaceOptions {
  readonly restored?: SessionView
}

export const makeDeterministicSessionSurface = (
  initial: CodexPersistedFact,
  options: DeterministicSessionSurfaceOptions = {},
): Effect.Effect<DeterministicSessionSurface, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const factRef = yield* Ref.make(initial)
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-surface-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const read = Effect.fn("SessionSource.SurfaceTest.read")(function* () {
      return yield* Ref.get(factRef)
    })
    const source: SessionSourceInterface = {
      discover: read,
      poll: read,
    }
    const storagePath = join(directory, "packwalk.sqlite")
    const restored = options.restored
    if (restored !== undefined) {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const storageContext = yield* Layer.build(
            sqliteSessionStorageLayer(storagePath),
          )
          yield* Context.get(storageContext, SessionStorage).commit(
            restored,
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
      persistSourceUpdate: (sourceUpdatedAtMs) =>
        Ref.update(factRef, (fact) =>
          CodexPersistedFact.make({ ...fact, sourceUpdatedAtMs }),
        ),
    }
  })

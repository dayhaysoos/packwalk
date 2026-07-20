import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Scope, Stream } from "effect"

import {
  connectSessionEvents,
  LocalIpcError,
} from "../../src/adapters/local-session-ipc.js"
import {
  codexSourceLayer,
  layer as sqliteSessionStorageLayer,
} from "../../src/adapters/sqlite-session-storage.js"
import { sessionDaemonLayer } from "../../src/daemon/session-runtime.js"
import type { SessionEvent } from "../../src/domain/session.js"
import {
  createCodexIndexFixture,
  replaceCodexIndexFixture,
  updateCodexIndexFixture,
  type CodexIndexFixture,
} from "./codex-index-fixture.js"

export interface CodexIndexedPackWalk {
  readonly events: Stream.Stream<SessionEvent, LocalIpcError>
  readonly persistCodexActivity: (
    sourceUpdatedAtMs: number,
  ) => Effect.Effect<void, unknown>
  readonly replaceCodexSession: (
    replacement: Omit<CodexIndexFixture, "forbiddenContent">,
  ) => Effect.Effect<void, unknown>
}

export const makeCodexIndexedPackWalk = (
  fixture: CodexIndexFixture,
): Effect.Effect<CodexIndexedPackWalk, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-codex-index-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const codexDatabasePath = join(directory, "state_5.sqlite")
    yield* createCodexIndexFixture(codexDatabasePath, fixture)

    const dependencies = Layer.mergeAll(
      codexSourceLayer(codexDatabasePath),
      sqliteSessionStorageLayer(join(directory, "packwalk.sqlite")),
    )
    const endpoint =
      process.platform === "win32"
        ? `\\\\.\\pipe\\packwalk-codex-test-${randomUUID()}`
        : join(directory, "daemon.sock")
    yield* Layer.build(
      sessionDaemonLayer(endpoint).pipe(Layer.provide(dependencies)),
    ).pipe(Effect.provide(NodeServices.layer))

    return {
      events: Stream.unwrap(connectSessionEvents(endpoint)),
      persistCodexActivity: (sourceUpdatedAtMs) =>
        updateCodexIndexFixture(
          codexDatabasePath,
          fixture.sessionId,
          sourceUpdatedAtMs,
        ),
      replaceCodexSession: (replacement) =>
        replaceCodexIndexFixture(
          codexDatabasePath,
          fixture.sessionId,
          replacement,
        ),
    }
  })

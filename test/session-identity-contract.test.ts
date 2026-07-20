import { DatabaseSync } from "node:sqlite"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import { expectTypeOf } from "vitest"

import type { ProjectIdentityResolver } from "../src/adapters/project-identity.js"
import { layer as sqliteSessionStorageLayer } from "../src/adapters/sqlite-session-storage.js"
import type { Interface as SessionSource } from "../src/application/session-source.js"
import { Service as SessionStorage } from "../src/application/session-storage.js"
import {
  CodexPersistedFact,
  ProjectIdentity,
  type ProjectIdentity as ProjectIdentityValue,
  SessionIdentity,
  type SessionIdentity as SessionIdentityValue,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const rawSessionIdentity = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"
const rawProjectIdentity = "fixture-project"

it.effect("keeps session and project identities nominally distinct while encoding plain strings", () =>
  Effect.gen(function* () {
    expectTypeOf<SessionIdentityValue>().not.toEqualTypeOf<ProjectIdentityValue>()
    expectTypeOf<CodexPersistedFact["sessionId"]>().toEqualTypeOf<SessionIdentityValue>()
    expectTypeOf<CodexPersistedFact["projectIdentity"]>().toEqualTypeOf<ProjectIdentityValue>()
    expectTypeOf<SessionView["sessionId"]>().toEqualTypeOf<SessionIdentityValue>()
    expectTypeOf<SessionView["projectIdentity"]>().toEqualTypeOf<ProjectIdentityValue>()
    expectTypeOf<Parameters<SessionSource["poll"]>[0]>().toEqualTypeOf<SessionIdentityValue>()
    expectTypeOf<
      Effect.Success<ReturnType<ProjectIdentityResolver["resolve"]>>
    >().toEqualTypeOf<ProjectIdentityValue>()

    const sessionId = yield* Schema.decodeUnknownEffect(SessionIdentity)(
      rawSessionIdentity,
    )
    const projectIdentity = yield* Schema.decodeUnknownEffect(ProjectIdentity)(
      rawProjectIdentity,
    )
    const fact = CodexPersistedFact.make({
      version: 1,
      sessionId,
      projectIdentity,
      sourceUpdatedAtMs: 1_000,
    })
    const encoded = yield* Schema.encodeEffect(CodexPersistedFact)(fact)

    expect(encoded.sessionId).toBe(rawSessionIdentity)
    expect(encoded.projectIdentity).toBe(rawProjectIdentity)
  }),
)

it.effect("round-trips branded identities through the SQLite adapter as wire strings", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-identity-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const path = join(directory, "packwalk.sqlite")
    const sessionId = yield* Schema.decodeUnknownEffect(SessionIdentity)(
      rawSessionIdentity,
    )
    const projectIdentity = yield* Schema.decodeUnknownEffect(ProjectIdentity)(
      rawProjectIdentity,
    )

    const loaded = yield* Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(sqliteSessionStorageLayer(path))
        const storage = Context.get(context, SessionStorage)
        yield* storage.commit(0, [
          SessionView.make({
            protocolVersion: 1,
            sessionId,
            projectIdentity,
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: SessionState.cases.Discovered.make({}),
            freshness: "fresh",
            sourceUpdatedAtMs: 1_000,
            observedAtMs: 2_000,
            commitSequence: 1,
          }),
        ])
        return yield* storage.load()
      }),
    )

    const database = new DatabaseSync(path, { readOnly: true })
    const row = database
      .prepare("SELECT session_id, project_identity FROM current_sessions")
      .get()
    database.close()
    expect(row).toEqual({
      session_id: rawSessionIdentity,
      project_identity: rawProjectIdentity,
    })

    const loadedView = loaded.views[0]
    if (loadedView === undefined) {
      return yield* Effect.die("Expected one stored session view")
    }
    expectTypeOf(loadedView.sessionId).toEqualTypeOf<SessionIdentityValue>()
    expectTypeOf(loadedView.projectIdentity).toEqualTypeOf<ProjectIdentityValue>()
    expect(loadedView.sessionId).toBe(rawSessionIdentity)
    expect(loadedView.projectIdentity).toBe(rawProjectIdentity)
    expect(loaded.lastCommitSequence).toBe(1)
  }),
)

import { DatabaseSync } from "node:sqlite"
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, it } from "@effect/vitest"
import { Context, Effect, Exit, Fiber, Layer, Scope } from "effect"

import { Service as SessionStorage } from "../src/application/session-storage.js"
import {
  completeSqliteBackup,
  layer as sqliteSessionStorageLayer,
  prepareVersionedStorage,
} from "../src/adapters/sqlite-session-storage.js"
import {
  ProjectIdentity,
  SessionIdentity,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

interface StoredSessionRow {
  readonly protocolVersion: number
  readonly sessionId: string
  readonly projectIdentity: string
  readonly activity: string
  readonly evidenceSource: string
  readonly stateTag: string
  readonly freshness: string
  readonly sourceUpdatedAtMs: number
  readonly observedAtMs: number
  readonly commitSequence: number
}

const validRow: StoredSessionRow = {
  protocolVersion: 1,
  sessionId: "019f77d2-1a10-7cf0-b5df-76eebb4071ab",
  projectIdentity: "fixture-project",
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  stateTag: "Discovered",
  freshness: "fresh",
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
}

const makeSessionView = (
  sessionId: string,
  commitSequence: number,
  sourceUpdatedAtMs: number,
  observedAtMs: number,
  state: "Discovered" | "Polled" = "Discovered",
) =>
  SessionView.make({
    protocolVersion: 1,
    sessionId: SessionIdentity.make(sessionId),
    projectIdentity: ProjectIdentity.make("shared-fixture-project"),
    activity: "persisted Codex activity",
    evidenceSource: "codex-sqlite-thread-index",
    state:
      state === "Discovered"
        ? SessionState.cases.Discovered.make({})
        : SessionState.cases.Polled.make({}),
    freshness: "fresh",
    sourceUpdatedAtMs,
    observedAtMs,
    commitSequence,
  })

const seedLooseSessionTable = (path: string, row: StoredSessionRow) => {
  const database = new DatabaseSync(path)
  try {
    database.exec(`
      CREATE TABLE current_session (
        singleton,
        protocol_version,
        session_id,
        project_identity,
        activity,
        evidence_source,
        state_tag,
        freshness,
        source_updated_at_ms,
        observed_at_ms,
        commit_sequence
      )
    `)
    database
      .prepare(`
        INSERT INTO current_session VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        row.protocolVersion,
        row.sessionId,
        row.projectIdentity,
        row.activity,
        row.evidenceSource,
        row.stateTag,
        row.freshness,
        row.sourceUpdatedAtMs,
        row.observedAtMs,
        row.commitSequence,
      )
  } finally {
    database.close()
  }
}

it.effect("rejects every incompatible legacy field during migration without echoing it", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-row-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const sensitiveValue = "sensitive-driver-or-schema-value"
    const incompatibleRows: ReadonlyArray<StoredSessionRow> = [
      { ...validRow, protocolVersion: 2 },
      { ...validRow, sessionId: "" },
      { ...validRow, projectIdentity: "" },
      { ...validRow, activity: sensitiveValue },
      { ...validRow, evidenceSource: "unsupported-evidence" },
      { ...validRow, stateTag: "Watched" },
      { ...validRow, freshness: "live" },
      { ...validRow, sourceUpdatedAtMs: -1 },
      { ...validRow, sourceUpdatedAtMs: 1.5 },
      { ...validRow, sourceUpdatedAtMs: 8_640_000_000_000_001 },
      { ...validRow, sourceUpdatedAtMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...validRow, observedAtMs: -1 },
      { ...validRow, observedAtMs: 1.5 },
      { ...validRow, observedAtMs: 8_640_000_000_000_001 },
      { ...validRow, observedAtMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...validRow, commitSequence: 0 },
      { ...validRow, commitSequence: 1.5 },
      { ...validRow, commitSequence: Number.MAX_SAFE_INTEGER + 1 },
    ]

    for (const [index, row] of incompatibleRows.entries()) {
      const path = join(directory, `incompatible-${index}.sqlite`)
      yield* Effect.sync(() => seedLooseSessionTable(path, row))
      const error = yield* Effect.flip(
        Layer.build(sqliteSessionStorageLayer(path)),
      )

      expect(error).toMatchObject({
        operation: "SessionStorage.open",
        message: "PackWalk could not open its session storage",
      })
      expect(JSON.stringify(error)).not.toContain(sensitiveValue)
    }
  }),
  30_000,
)

it.effect("preserves a valid legacy session with a checked migration and SQLite backup", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-migration-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const path = join(directory, "packwalk.sqlite")
    const legacyRow = { ...validRow, commitSequence: 7 }
    yield* Effect.sync(() => seedLooseSessionTable(path, legacyRow))

    const context = yield* Layer.build(sqliteSessionStorageLayer(path))
    const storage = Context.get(context, SessionStorage)

    expect(yield* storage.load()).toEqual({
      views: [
        {
          protocolVersion: legacyRow.protocolVersion,
          sessionId: legacyRow.sessionId,
          projectIdentity: legacyRow.projectIdentity,
          activity: legacyRow.activity,
          evidenceSource: legacyRow.evidenceSource,
          state: { _tag: legacyRow.stateTag },
          freshness: legacyRow.freshness,
          sourceUpdatedAtMs: legacyRow.sourceUpdatedAtMs,
          observedAtMs: legacyRow.observedAtMs,
          commitSequence: legacyRow.commitSequence,
        },
      ],
      lastCommitSequence: 7,
    })

    const migrated = new DatabaseSync(path, { readOnly: true })
    try {
      expect(
        migrated
          .prepare(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
          `)
          .all(),
      ).toEqual([
        { name: "current_sessions" },
        { name: "schema_migrations" },
        { name: "storage_state" },
      ])
      expect(
        migrated
          .prepare("SELECT version, checksum FROM schema_migrations")
          .get(),
      ).toMatchObject({
        version: 2,
        checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    } finally {
      migrated.close()
    }

    const backupDatabase = new DatabaseSync(
      `${path}.pre-migration-v2.sqlite`,
      { readOnly: true },
    )
    try {
      expect(
        backupDatabase
          .prepare(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          `)
          .all(),
      ).toEqual([{ name: "current_session" }])
      expect(
        backupDatabase
          .prepare(`
            SELECT session_id, project_identity, commit_sequence
            FROM current_session
            WHERE singleton = 1
          `)
          .get(),
      ).toEqual({
        session_id: legacyRow.sessionId,
        project_identity: legacyRow.projectIdentity,
        commit_sequence: legacyRow.commitSequence,
      })
    } finally {
      backupDatabase.close()
    }
  }),
  30_000,
)

it.effect("imports legacy state without taking its database away from an older daemon", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-import-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const legacyPath = join(directory, "packwalk.sqlite")
    const currentPath = join(directory, "packwalk-v2.sqlite")
    const legacyRow = { ...validRow, commitSequence: 7 }
    yield* Effect.sync(() => seedLooseSessionTable(legacyPath, legacyRow))
    const legacyWriter = yield* Effect.acquireRelease(
      Effect.sync(() => new DatabaseSync(legacyPath)),
      (database) => Effect.sync(() => database.close()),
    )

    yield* prepareVersionedStorage(legacyPath, currentPath)
    const context = yield* Layer.build(sqliteSessionStorageLayer(currentPath))
    const storage = Context.get(context, SessionStorage)
    const imported = yield* storage.load()
    expect(imported.lastCommitSequence).toBe(7)
    expect(imported.views[0]).toMatchObject({
      sessionId: legacyRow.sessionId,
      commitSequence: 7,
    })

    const retainedBackup = new DatabaseSync(
      `${currentPath}.pre-migration-v2.sqlite`,
      { readOnly: true },
    )
    try {
      expect(
        retainedBackup
          .prepare(`
            SELECT session_id, commit_sequence
            FROM current_session
            WHERE singleton = 1
          `)
          .get(),
      ).toEqual({
        session_id: legacyRow.sessionId,
        commit_sequence: 7,
      })
    } finally {
      retainedBackup.close()
    }

    yield* Effect.sync(() => {
      legacyWriter
        .prepare(`
          UPDATE current_session
          SET observed_at_ms = 9000
          WHERE singleton = 1
        `)
        .run()
    })
    expect(
      yield* Effect.sync(() =>
        legacyWriter
          .prepare(`
            SELECT observed_at_ms
            FROM current_session
            WHERE singleton = 1
          `)
          .get(),
      ),
    ).toEqual({ observed_at_ms: 9_000 })
    expect(yield* storage.load()).toEqual(imported)
  }),
)

it.effect("imports committed legacy WAL state while the old writer remains active", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-wal-import-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const legacyPath = join(directory, "packwalk.sqlite")
    const currentPath = join(directory, "packwalk-v2.sqlite")
    const legacyRow = { ...validRow, commitSequence: 7 }
    yield* Effect.sync(() => seedLooseSessionTable(legacyPath, legacyRow))
    const legacyWriter = yield* Effect.acquireRelease(
      Effect.sync(() => new DatabaseSync(legacyPath)),
      (database) => Effect.sync(() => database.close()),
    )
    yield* Effect.sync(() => {
      legacyWriter.exec("PRAGMA journal_mode = WAL")
      legacyWriter.exec("PRAGMA wal_autocheckpoint = 0")
      legacyWriter.exec("BEGIN IMMEDIATE")
      legacyWriter
        .prepare(`
          UPDATE current_session
          SET source_updated_at_ms = 8000, observed_at_ms = 9000
          WHERE singleton = 1
        `)
        .run()
      legacyWriter.exec("COMMIT")
    })
    expect(existsSync(`${legacyPath}-wal`)).toBe(true)
    expect(existsSync(`${legacyPath}-shm`)).toBe(true)

    yield* prepareVersionedStorage(legacyPath, currentPath)
    const context = yield* Layer.build(sqliteSessionStorageLayer(currentPath))
    const storage = Context.get(context, SessionStorage)
    const imported = yield* storage.load()
    expect(imported.views[0]).toMatchObject({
      sourceUpdatedAtMs: 8_000,
      observedAtMs: 9_000,
      commitSequence: 7,
    })

    const retainedBackup = new DatabaseSync(
      `${currentPath}.pre-migration-v2.sqlite`,
      { readOnly: true },
    )
    try {
      expect(
        retainedBackup
          .prepare(`
            SELECT source_updated_at_ms, observed_at_ms
            FROM current_session
            WHERE singleton = 1
          `)
          .get(),
      ).toEqual({
        source_updated_at_ms: 8_000,
        observed_at_ms: 9_000,
      })
    } finally {
      retainedBackup.close()
    }

    yield* Effect.sync(() => {
      legacyWriter
        .prepare(`
          UPDATE current_session
          SET observed_at_ms = 10000
          WHERE singleton = 1
        `)
        .run()
    })
    expect(
      yield* Effect.sync(() =>
        legacyWriter
          .prepare(`
            SELECT observed_at_ms
            FROM current_session
            WHERE singleton = 1
          `)
          .get(),
      ),
    ).toEqual({ observed_at_ms: 10_000 })
    expect(yield* storage.load()).toEqual(imported)
  }),
)

it.effect("resumes import when a retained migration backup already exists", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-resume-import-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const legacyPath = join(directory, "packwalk.sqlite")
    const currentPath = join(directory, "packwalk-v2.sqlite")
    const retainedBackupPath = `${currentPath}.pre-migration-v2.sqlite`
    const legacyRow = { ...validRow, commitSequence: 7 }
    const retainedRow = {
      ...legacyRow,
      observedAtMs: 1_500,
    }
    yield* Effect.sync(() => {
      seedLooseSessionTable(legacyPath, legacyRow)
      seedLooseSessionTable(retainedBackupPath, retainedRow)
    })

    yield* prepareVersionedStorage(legacyPath, currentPath)
    const context = yield* Layer.build(sqliteSessionStorageLayer(currentPath))
    const storage = Context.get(context, SessionStorage)

    expect(yield* storage.load()).toEqual({
      views: [
        {
          protocolVersion: legacyRow.protocolVersion,
          sessionId: legacyRow.sessionId,
          projectIdentity: legacyRow.projectIdentity,
          activity: legacyRow.activity,
          evidenceSource: legacyRow.evidenceSource,
          state: { _tag: legacyRow.stateTag },
          freshness: legacyRow.freshness,
          sourceUpdatedAtMs: legacyRow.sourceUpdatedAtMs,
          observedAtMs: legacyRow.observedAtMs,
          commitSequence: legacyRow.commitSequence,
        },
      ],
      lastCommitSequence: 7,
    })

    const retainedBackup = new DatabaseSync(retainedBackupPath, {
      readOnly: true,
    })
    try {
      expect(
        retainedBackup
          .prepare(`
            SELECT observed_at_ms
            FROM current_session
            WHERE singleton = 1
          `)
          .get(),
      ).toEqual({ observed_at_ms: retainedRow.observedAtMs })
    } finally {
      retainedBackup.close()
    }
    expect(
      readdirSync(directory).filter((name) => name.includes(".import-")),
    ).toEqual([])
  }),
)

it.effect("never overwrites an existing versioned database with stale legacy state", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-current-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const legacyPath = join(directory, "packwalk.sqlite")
    const currentPath = join(directory, "packwalk-v2.sqlite")
    const context = yield* Layer.build(sqliteSessionStorageLayer(currentPath))
    const storage = Context.get(context, SessionStorage)
    const currentView = makeSessionView(
      "019f77d2-1a10-7cf0-b5df-76eebb4071cc",
      1,
      3_000,
      4_000,
    )
    yield* storage.commit(0, [currentView])
    yield* Effect.sync(() =>
      seedLooseSessionTable(legacyPath, {
        ...validRow,
        sessionId: "019f77d2-1a10-7cf0-b5df-76eebb4071dd",
        commitSequence: 7,
      }),
    )

    yield* prepareVersionedStorage(legacyPath, currentPath)

    expect(yield* storage.load()).toEqual({
      views: [currentView],
      lastCommitSequence: 1,
    })
  }),
)

it.effect("removes import staging and leaves no current database when import fails", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-failed-import-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const legacyPath = join(directory, "packwalk.sqlite")
    const currentPath = join(directory, "packwalk-v2.sqlite")
    yield* Effect.sync(() =>
      seedLooseSessionTable(legacyPath, {
        ...validRow,
        activity: "incompatible imported activity",
      }),
    )

    const error = yield* Effect.flip(
      prepareVersionedStorage(legacyPath, currentPath),
    )

    expect(error).toMatchObject({
      operation: "SessionStorage.open",
      message: "PackWalk could not open its session storage",
    })
    expect(readdirSync(directory)).not.toContain("packwalk-v2.sqlite")
    expect(
      readdirSync(directory).filter((name) =>
        name.startsWith("packwalk-v2.sqlite.import-"),
      ),
    ).toEqual([])
  }),
)

it.effect("closes a partially configured legacy import connection", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-import-close-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const legacyPath = join(directory, "packwalk.sqlite")
    const currentPath = join(directory, "packwalk-v2.sqlite")
    yield* Effect.sync(() => seedLooseSessionTable(legacyPath, validRow))

    const originalEnableDefensive = DatabaseSync.prototype.enableDefensive
    const originalClose = DatabaseSync.prototype.close
    let failNextHardening = true
    let closeCount = 0
    DatabaseSync.prototype.enableDefensive = function(
      this: DatabaseSync,
      active: boolean,
    ) {
      if (failNextHardening) {
        failNextHardening = false
        throw new Error("synthetic hardening failure")
      }
      return originalEnableDefensive.call(this, active)
    }
    DatabaseSync.prototype.close = function(this: DatabaseSync) {
      closeCount += 1
      return originalClose.call(this)
    }

    try {
      const error = yield* Effect.flip(
        prepareVersionedStorage(legacyPath, currentPath),
      )
      expect(error).toMatchObject({
        operation: "SessionStorage.open",
        message: "PackWalk could not open its session storage",
      })
    } finally {
      DatabaseSync.prototype.enableDefensive = originalEnableDefensive
      DatabaseSync.prototype.close = originalClose
    }

    expect(closeCount).toBe(1)
    expect(readdirSync(directory)).not.toContain("packwalk-v2.sqlite")
    expect(
      readdirSync(directory).filter((name) =>
        name.startsWith("packwalk-v2.sqlite.import-"),
      ),
    ).toEqual([])
  }),
)

it.effect("waits for SQLite backup completion before releasing its source", () =>
  Effect.gen(function* () {
    const backup = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const events: Array<string> = []
    const fiber = yield* Effect.acquireUseRelease(
      Effect.sync(() => events.push("acquired")),
      () =>
        completeSqliteBackup(() => {
          events.push("backup-started")
          started.resolve()
          return backup.promise
        }),
      () => Effect.sync(() => events.push("released")),
    ).pipe(Effect.forkChild)

    yield* Effect.promise(() => started.promise)
    const interruption = yield* Fiber.interrupt(fiber).pipe(Effect.forkChild)
    yield* Effect.yieldNow

    expect(events).toEqual(["acquired", "backup-started"])

    backup.resolve()
    yield* Fiber.join(interruption)
    expect(events).toEqual(["acquired", "backup-started", "released"])
  }),
)

it.effect("allocates one global sequence while isolating two session commits", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-batch-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const path = join(directory, "packwalk.sqlite")
    const context = yield* Layer.build(sqliteSessionStorageLayer(path))
    const storage = Context.get(context, SessionStorage)
    const first = makeSessionView(
      "019f77d2-1a10-7cf0-b5df-76eebb4071aa",
      1,
      1_000,
      2_000,
    )
    const second = makeSessionView(
      "019f77d2-1a10-7cf0-b5df-76eebb4071bb",
      2,
      1_100,
      2_000,
    )

    yield* storage.commit(0, [second, first])
    expect(yield* storage.load()).toEqual({
      views: [first, second],
      lastCommitSequence: 2,
    })

    const updatedFirst = makeSessionView(
      first.sessionId,
      3,
      1_500,
      2_500,
      "Polled",
    )
    yield* storage.commit(2, [updatedFirst])
    expect(yield* storage.load()).toEqual({
      views: [updatedFirst, second],
      lastCommitSequence: 3,
    })

    const staleSecond = makeSessionView(
      second.sessionId,
      3,
      9_000,
      9_000,
      "Polled",
    )
    const staleCommitError = yield* Effect.flip(
      storage.commit(2, [staleSecond]),
    )
    expect(staleCommitError).toMatchObject({
      operation: "SessionStorage.commit",
      message: "PackWalk could not commit its current session view",
    })
    expect(yield* storage.load()).toEqual({
      views: [updatedFirst, second],
      lastCommitSequence: 3,
    })
  }),
)

it.effect("closes the SQLite connection when storage acquisition fails after opening", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-open-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const path = join(directory, "corrupt.sqlite")
    yield* Effect.sync(() => writeFileSync(path, "not a SQLite database"))

    const originalClose = DatabaseSync.prototype.close
    let closeCount = 0
    DatabaseSync.prototype.close = function(this: DatabaseSync) {
      closeCount += 1
      return originalClose.call(this)
    }

    try {
      const error = yield* Effect.flip(
        Layer.build(sqliteSessionStorageLayer(path)),
      )
      expect(error).toMatchObject({
        operation: "SessionStorage.open",
        message: "PackWalk could not open its session storage",
      })
      expect(closeCount).toBe(1)
    } finally {
      DatabaseSync.prototype.close = originalClose
    }
  }),
)

it.effect("keeps one storage connection for the scope and closes it at finalization", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-storage-scope-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const path = join(directory, "packwalk.sqlite")
    const scope = yield* Scope.make()
    const originalClose = DatabaseSync.prototype.close
    let closeCount = 0
    DatabaseSync.prototype.close = function(this: DatabaseSync) {
      closeCount += 1
      return originalClose.call(this)
    }

    try {
      const context = yield* Layer.buildWithScope(
        sqliteSessionStorageLayer(path),
        scope,
      )
      const storage = Context.get(context, SessionStorage)

      expect(yield* storage.load()).toEqual({
        views: [],
        lastCommitSequence: 0,
      })
      expect(closeCount).toBe(0)

      yield* Scope.close(scope, Exit.void)
      expect(closeCount).toBe(1)

      const error = yield* Effect.flip(storage.load())
      expect(error).toMatchObject({
        operation: "SessionStorage.load",
        message: "PackWalk could not read its stored session view",
      })
    } finally {
      yield* Scope.close(scope, Exit.void)
      DatabaseSync.prototype.close = originalClose
    }
  }),
)

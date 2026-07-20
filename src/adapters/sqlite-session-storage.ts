import { createHash, randomUUID } from "node:crypto"
import {
  constants as FsConstants,
  copyFileSync,
  existsSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { backup, DatabaseSync } from "node:sqlite"

import { Effect, Layer, Schema } from "effect"

import {
  type NonEmptySessionFacts,
  Service as SessionSource,
  SessionSourceError,
} from "../application/session-source.js"
import { Service, SessionStorageError } from "../application/session-storage.js"
import {
  CodexPersistedFact,
  DateTimestampMs,
  Identity,
  ProjectIdentity,
  SessionIdentity,
  SessionProvenance,
  SessionRetentionReason,
  SessionState,
  SessionView,
} from "../domain/session.js"
import {
  makeProjectIdentityResolver,
  projectIdentityComparisonKey,
  type ProjectIdentityPlatform,
  type ProjectIdentityResolver,
} from "./project-identity.js"

const MaximumSafeInteger = Number.MAX_SAFE_INTEGER

const NonNegativeSafeInteger = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(MaximumSafeInteger),
)

const PositiveSafeInteger = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
  Schema.isLessThanOrEqualTo(MaximumSafeInteger),
)

const CodexThreadRow = Schema.Struct({
  session_id: SessionIdentity,
  session_cwd: Identity,
  source_updated_at_ms: DateTimestampMs,
})

interface CodexThreadRow extends Schema.Schema.Type<typeof CodexThreadRow> {}

const Version2SessionRow = Schema.Struct({
  protocol_version: Schema.Literal(1),
  session_id: SessionIdentity,
  project_identity: ProjectIdentity,
  activity: Schema.Literal("persisted Codex activity"),
  evidence_source: Schema.Literal("codex-sqlite-thread-index"),
  state_tag: Schema.Literals(["Discovered", "Polled"]),
  freshness: Schema.Literal("fresh"),
  source_updated_at_ms: DateTimestampMs,
  observed_at_ms: DateTimestampMs,
  commit_sequence: PositiveSafeInteger,
})

interface Version2SessionRow extends Schema.Schema.Type<typeof Version2SessionRow> {}

const CurrentSessionRowFields = {
  protocol_version: Schema.Literal(2),
  session_id: SessionIdentity,
  project_identity: ProjectIdentity,
  activity: Schema.Literal("persisted Codex activity"),
  evidence_source: Schema.Literal("codex-sqlite-thread-index"),
  state_tag: Schema.Literals(["Discovered", "Polled"]),
  source_updated_at_ms: DateTimestampMs,
  observed_at_ms: DateTimestampMs,
  commit_sequence: PositiveSafeInteger,
} as const

const ObservedSessionRow = Schema.Struct({
  ...CurrentSessionRowFields,
  freshness: Schema.Literal("fresh"),
  provenance_tag: Schema.Literal("Observed"),
  retention_reason: Schema.Null,
})

const RetainedSessionRow = Schema.Struct({
  ...CurrentSessionRowFields,
  freshness: Schema.Literal("stale"),
  provenance_tag: Schema.Literal("Retained"),
  retention_reason: SessionRetentionReason,
})

const SessionRow = Schema.Union([
  ObservedSessionRow,
  RetainedSessionRow,
])

type SessionRow = typeof SessionRow.Type

const LegacySessionRow = Schema.Struct({
  singleton: Schema.Literal(1),
  ...Version2SessionRow.fields,
})

interface LegacySessionRow extends Schema.Schema.Type<typeof LegacySessionRow> {}

const StorageStateRow = Schema.Struct({
  singleton: Schema.Literal(1),
  last_commit_sequence: NonNegativeSafeInteger,
})

const TableNameRow = Schema.Struct({ name: Schema.NonEmptyString })
const MigrationRow = Schema.Struct({
  version: PositiveSafeInteger,
  checksum: Schema.NonEmptyString,
})

const storageErrorMessages = {
  "SessionStorage.open": "PackWalk could not open its session storage",
  "SessionStorage.decodeRow": "PackWalk could not decode its stored session view",
  "SessionStorage.load": "PackWalk could not read its stored session view",
  "SessionStorage.commit": "PackWalk could not commit its current session view",
} as const

type StorageOperation = keyof typeof storageErrorMessages

const storageError = (operation: StorageOperation) =>
  new SessionStorageError({
    operation,
    message: storageErrorMessages[operation],
  })

/** @internal Exported only for the deterministic backup-finalization law. */
export const completeSqliteBackup = (
  operation: () => Promise<unknown>,
): Effect.Effect<void, SessionStorageError> =>
  Effect.tryPromise({
    try: operation,
    catch: () => storageError("SessionStorage.open"),
  }).pipe(Effect.uninterruptible, Effect.asVoid)

const removeImportStaging = (path: string) =>
  Effect.forEach(
    [path, `${path}-journal`, `${path}-wal`, `${path}-shm`],
    (artifactPath) =>
      Effect.try({
        try: () => rmSync(artifactPath, { force: true }),
        catch: () => storageError("SessionStorage.open"),
      }),
    { discard: true },
  )

const openLegacyImportSource = (path: string) =>
  Effect.try({
    try: () => {
      const database = new DatabaseSync(path, {
        allowBareNamedParameters: false,
        allowExtension: false,
        allowUnknownNamedParameters: false,
        defensive: true,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
        readBigInts: false,
        readOnly: true,
        returnArrays: false,
        timeout: 2_000,
      })
      try {
        database.enableDefensive(true)
        database.enableLoadExtension(false)
        database.exec("PRAGMA query_only = ON")
        database.exec("PRAGMA trusted_schema = OFF")
        return database
      } catch (error) {
        try {
          database.close()
        } catch {
          // Acquisition reports the original source configuration failure.
        }
        throw error
      }
    },
    catch: () => storageError("SessionStorage.open"),
  })

const sourceError = (
  code: "unavailable" | "unsupported" | "invalid-evidence" | "ambiguous",
) =>
  new SessionSourceError({
    code,
    message:
      code === "ambiguous"
        ? "Codex persisted evidence is ambiguous"
        : "Codex persisted evidence is unavailable or incompatible",
  })

const compareStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

const isProjectIdentityPlatform = (
  platform: NodeJS.Platform,
): platform is ProjectIdentityPlatform =>
  platform === "darwin" || platform === "linux" || platform === "win32"

const queryCodexThreads = Effect.fn("CodexSource.queryThreads")(function* (
  path: string,
  sessionId?: SessionIdentity,
) {
  const rows = yield* Effect.try({
    try: () => {
      const database = new DatabaseSync(path, {
        allowBareNamedParameters: false,
        allowExtension: false,
        allowUnknownNamedParameters: false,
        defensive: true,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
        readBigInts: false,
        readOnly: true,
        returnArrays: false,
        timeout: 2_000,
      })

      try {
        database.enableDefensive(true)
        database.enableLoadExtension(false)
        database.exec("PRAGMA query_only = ON")
        database.exec("PRAGMA trusted_schema = OFF")

        const settings = database
          .prepare(`
            SELECT
              (SELECT query_only FROM pragma_query_only) AS query_only,
              (SELECT trusted_schema FROM pragma_trusted_schema) AS trusted_schema
          `)
          .get()
        if (settings?.query_only !== 1 || settings.trusted_schema !== 0) {
          throw sourceError("unsupported")
        }

        const columns = database
          .prepare("SELECT name FROM pragma_table_info('threads')")
          .all()
        const columnNames = new Set(columns.map((column) => column.name))
        for (const required of [
          "id",
          "cwd",
          "updated_at_ms",
          "archived",
          "thread_source",
        ]) {
          if (!columnNames.has(required)) {
            throw sourceError("unsupported")
          }
        }

        return sessionId === undefined
          ? database
              .prepare(`
                SELECT
                  id AS session_id,
                  cwd AS session_cwd,
                  updated_at_ms AS source_updated_at_ms
                FROM threads
                WHERE thread_source = 'user' AND archived = 0
                ORDER BY updated_at_ms DESC, id COLLATE BINARY DESC
              `)
              .all()
          : database
              .prepare(`
                SELECT
                  id AS session_id,
                  cwd AS session_cwd,
                  updated_at_ms AS source_updated_at_ms
                FROM threads
                WHERE
                  id COLLATE BINARY = ? AND
                  thread_source = 'user' AND
                  archived = 0
                ORDER BY id COLLATE BINARY
              `)
              .all(sessionId)
      } finally {
        database.close()
      }
    },
    catch: (error) =>
      error instanceof SessionSourceError ? error : sourceError("unavailable"),
  })

  return yield* Schema.decodeUnknownEffect(Schema.Array(CodexThreadRow), {
    onExcessProperty: "error",
  })(rows).pipe(
    Effect.mapError(() => sourceError("invalid-evidence")),
  )
})

const ensureUniqueSourceIdentity = (
  rows: ReadonlyArray<CodexThreadRow>,
): Effect.Effect<void, SessionSourceError> => {
  const identities = new Set<string>()
  for (const row of rows) {
    if (identities.has(row.session_id)) {
      return Effect.fail(sourceError("ambiguous"))
    }
    identities.add(row.session_id)
  }
  return Effect.void
}

const decodeCodexFacts = Effect.fn("CodexSource.decodeFacts")(function* (
  rows: ReadonlyArray<CodexThreadRow>,
  projectIdentityResolver: ProjectIdentityResolver,
) {
  yield* ensureUniqueSourceIdentity(rows)

  return yield* Effect.forEach(rows, (row) =>
    projectIdentityResolver.resolve(row.session_cwd).pipe(
      Effect.mapError(() => sourceError("invalid-evidence")),
      Effect.map((projectIdentity) =>
        CodexPersistedFact.make({
          version: 1,
          sessionId: row.session_id,
          projectIdentity,
          sourceUpdatedAtMs: row.source_updated_at_ms,
        }),
      ),
    ),
  )
})

const discoverCodexThreads = Effect.fn("CodexSource.discover")(function* (
  path: string,
  projectIdentityResolver: ProjectIdentityResolver,
  platform: ProjectIdentityPlatform,
) {
  const rows = yield* queryCodexThreads(path)
  if (rows.length === 0) {
    return yield* sourceError("unavailable")
  }

  const facts = yield* decodeCodexFacts(rows, projectIdentityResolver)
  const ordered = [...facts].sort((left, right) => {
    const projectOrder = compareStrings(
      projectIdentityComparisonKey(left.projectIdentity, platform),
      projectIdentityComparisonKey(right.projectIdentity, platform),
    )
    if (projectOrder !== 0) return projectOrder

    const exactProjectOrder = compareStrings(
      left.projectIdentity,
      right.projectIdentity,
    )
    return exactProjectOrder !== 0
      ? exactProjectOrder
      : compareStrings(left.sessionId, right.sessionId)
  })
  const first = ordered[0]
  if (first === undefined) {
    return yield* sourceError("unavailable")
  }
  const discovered: NonEmptySessionFacts = [first, ...ordered.slice(1)]
  return discovered
})

const pollCodexThread = Effect.fn("CodexSource.poll")(function* (
  path: string,
  projectIdentityResolver: ProjectIdentityResolver,
  sessionId: SessionIdentity,
) {
  const rows = yield* queryCodexThreads(path, sessionId)
  if (rows.length === 0) {
    return yield* sourceError("unavailable")
  }
  if (rows.length > 1) {
    return yield* sourceError("ambiguous")
  }

  const facts = yield* decodeCodexFacts(rows, projectIdentityResolver)
  const fact = facts[0]
  return fact === undefined ? yield* sourceError("unavailable") : fact
})

export const codexSourceLayer = (path: string) =>
  Layer.effect(
    SessionSource,
    Effect.gen(function* () {
      const projectIdentityResolver = yield* makeProjectIdentityResolver
      if (!isProjectIdentityPlatform(process.platform)) {
        return yield* sourceError("unsupported")
      }
      const platform = process.platform

      return SessionSource.of({
        discover: () =>
          discoverCodexThreads(path, projectIdentityResolver, platform),
        poll: (sessionId) =>
          pollCodexThread(path, projectIdentityResolver, sessionId),
      })
    }),
  )

const createCurrentSchemaSql = `
  CREATE TABLE current_sessions (
    session_id TEXT PRIMARY KEY COLLATE BINARY NOT NULL CHECK (
      length(CAST(session_id AS BLOB)) BETWEEN 1 AND 4096
    ),
    protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
    project_identity TEXT NOT NULL CHECK (
      length(CAST(project_identity AS BLOB)) BETWEEN 1 AND 4096
    ),
    activity TEXT NOT NULL CHECK (activity = 'persisted Codex activity'),
    evidence_source TEXT NOT NULL CHECK (evidence_source = 'codex-sqlite-thread-index'),
    state_tag TEXT NOT NULL CHECK (state_tag IN ('Discovered', 'Polled')),
    freshness TEXT NOT NULL CHECK (freshness = 'fresh'),
    source_updated_at_ms INTEGER NOT NULL CHECK (
      source_updated_at_ms >= 0 AND
      source_updated_at_ms <= 8640000000000000
    ),
    observed_at_ms INTEGER NOT NULL CHECK (
      observed_at_ms >= 0 AND
      observed_at_ms <= 8640000000000000
    ),
    commit_sequence INTEGER NOT NULL UNIQUE CHECK (
      commit_sequence >= 1 AND commit_sequence <= 9007199254740991
    )
  );

  CREATE TABLE storage_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    last_commit_sequence INTEGER NOT NULL CHECK (
      last_commit_sequence >= 0 AND
      last_commit_sequence <= 9007199254740991
    )
  );

  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL CHECK (length(checksum) > 0)
  );
`

const migrateLegacySingletonSql = `
  ${createCurrentSchemaSql}

  INSERT INTO current_sessions (
    session_id,
    protocol_version,
    project_identity,
    activity,
    evidence_source,
    state_tag,
    freshness,
    source_updated_at_ms,
    observed_at_ms,
    commit_sequence
  )
  SELECT
    session_id,
    protocol_version,
    project_identity,
    activity,
    evidence_source,
    state_tag,
    freshness,
    source_updated_at_ms,
    observed_at_ms,
    commit_sequence
  FROM current_session
  WHERE singleton = 1;

  INSERT INTO storage_state (singleton, last_commit_sequence)
  SELECT 1, COALESCE(MAX(commit_sequence), 0)
  FROM current_sessions;

  DROP TABLE current_session;
`

const createCurrentSchemaV3Sql = `
  CREATE TABLE current_sessions (
    session_id TEXT PRIMARY KEY COLLATE BINARY NOT NULL CHECK (
      length(CAST(session_id AS BLOB)) BETWEEN 1 AND 4096
    ),
    protocol_version INTEGER NOT NULL CHECK (protocol_version = 2),
    project_identity TEXT NOT NULL CHECK (
      length(CAST(project_identity AS BLOB)) BETWEEN 1 AND 4096
    ),
    activity TEXT NOT NULL CHECK (activity = 'persisted Codex activity'),
    evidence_source TEXT NOT NULL CHECK (evidence_source = 'codex-sqlite-thread-index'),
    state_tag TEXT NOT NULL CHECK (state_tag IN ('Discovered', 'Polled')),
    freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale')),
    provenance_tag TEXT NOT NULL CHECK (
      provenance_tag IN ('Observed', 'Retained')
    ),
    retention_reason TEXT CHECK (
      retention_reason IS NULL OR
      retention_reason IN ('source-unavailable', 'source-unsupported')
    ),
    source_updated_at_ms INTEGER NOT NULL CHECK (
      source_updated_at_ms >= 0 AND
      source_updated_at_ms <= 8640000000000000
    ),
    observed_at_ms INTEGER NOT NULL CHECK (
      observed_at_ms >= 0 AND
      observed_at_ms <= 8640000000000000
    ),
    commit_sequence INTEGER NOT NULL UNIQUE CHECK (
      commit_sequence >= 1 AND commit_sequence <= 9007199254740991
    ),
    CHECK (
      (
        freshness = 'fresh' AND
        provenance_tag = 'Observed' AND
        retention_reason IS NULL
      ) OR (
        freshness = 'stale' AND
        provenance_tag = 'Retained' AND
        retention_reason IS NOT NULL
      )
    )
  );

  CREATE TABLE storage_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    last_commit_sequence INTEGER NOT NULL CHECK (
      last_commit_sequence >= 0 AND
      last_commit_sequence <= 9007199254740991
    )
  );

  CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL CHECK (length(checksum) > 0)
  );
`

const migrateVersion2OverviewSql = `
  ALTER TABLE current_sessions RENAME TO current_sessions_v2;

  CREATE TABLE current_sessions (
    session_id TEXT PRIMARY KEY COLLATE BINARY NOT NULL CHECK (
      length(CAST(session_id AS BLOB)) BETWEEN 1 AND 4096
    ),
    protocol_version INTEGER NOT NULL CHECK (protocol_version = 2),
    project_identity TEXT NOT NULL CHECK (
      length(CAST(project_identity AS BLOB)) BETWEEN 1 AND 4096
    ),
    activity TEXT NOT NULL CHECK (activity = 'persisted Codex activity'),
    evidence_source TEXT NOT NULL CHECK (evidence_source = 'codex-sqlite-thread-index'),
    state_tag TEXT NOT NULL CHECK (state_tag IN ('Discovered', 'Polled')),
    freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale')),
    provenance_tag TEXT NOT NULL CHECK (
      provenance_tag IN ('Observed', 'Retained')
    ),
    retention_reason TEXT CHECK (
      retention_reason IS NULL OR
      retention_reason IN ('source-unavailable', 'source-unsupported')
    ),
    source_updated_at_ms INTEGER NOT NULL CHECK (
      source_updated_at_ms >= 0 AND
      source_updated_at_ms <= 8640000000000000
    ),
    observed_at_ms INTEGER NOT NULL CHECK (
      observed_at_ms >= 0 AND
      observed_at_ms <= 8640000000000000
    ),
    commit_sequence INTEGER NOT NULL UNIQUE CHECK (
      commit_sequence >= 1 AND commit_sequence <= 9007199254740991
    ),
    CHECK (
      (
        freshness = 'fresh' AND
        provenance_tag = 'Observed' AND
        retention_reason IS NULL
      ) OR (
        freshness = 'stale' AND
        provenance_tag = 'Retained' AND
        retention_reason IS NOT NULL
      )
    )
  );

  INSERT INTO current_sessions (
    session_id,
    protocol_version,
    project_identity,
    activity,
    evidence_source,
    state_tag,
    freshness,
    provenance_tag,
    retention_reason,
    source_updated_at_ms,
    observed_at_ms,
    commit_sequence
  )
  SELECT
    session_id,
    2,
    project_identity,
    activity,
    evidence_source,
    state_tag,
    freshness,
    'Observed',
    NULL,
    source_updated_at_ms,
    observed_at_ms,
    commit_sequence
  FROM current_sessions_v2;

  DROP TABLE current_sessions_v2;
`

const currentMigration = {
  version: 2,
  checksum: createHash("sha256")
    .update(migrateLegacySingletonSql)
    .digest("hex"),
} as const

const retainedProjectionMigration = {
  version: 3,
  checksum: createHash("sha256")
    .update(migrateVersion2OverviewSql)
    .digest("hex"),
} as const

const storageMigrations = [
  currentMigration,
  retainedProjectionMigration,
] as const

const inspectStorageSchema = Effect.fn("SessionStorage.inspectSchema")(
  function* (database: DatabaseSync) {
    const rows = yield* Effect.try({
      try: () =>
        database
          .prepare(`
            SELECT name
            FROM sqlite_schema
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
          `)
          .all(),
      catch: () => storageError("SessionStorage.open"),
    })
    const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(TableNameRow), {
      onExcessProperty: "error",
    })(rows).pipe(
      Effect.mapError(() => storageError("SessionStorage.open")),
    )
    const names = decoded.map((row) => row.name)

    if (names.length === 0) return "fresh"
    if (names.length === 1 && names[0] === "current_session") {
      return "legacy-singleton"
    }
    if (
      names.length === 3 &&
      names[0] === "current_sessions" &&
      names[1] === "schema_migrations" &&
      names[2] === "storage_state"
    ) {
      return "current"
    }
    return yield* storageError("SessionStorage.open")
  },
)

const runSchemaTransaction = (
  database: DatabaseSync,
  body: () => void,
): Effect.Effect<void, SessionStorageError> =>
  Effect.try({
    try: () => {
      database.exec("BEGIN IMMEDIATE")
      try {
        body()
        database.exec("COMMIT")
      } catch (error) {
        try {
          database.exec("ROLLBACK")
        } catch {
          // The original migration failure is the truthful storage result.
        }
        throw error
      }
    },
    catch: () => storageError("SessionStorage.open"),
  })

type StorageMigration = typeof storageMigrations[number]

const recordMigration = (
  database: DatabaseSync,
  migration: StorageMigration,
): void => {
  database
    .prepare("INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)")
    .run(migration.version, migration.checksum)
}

const recordCurrentMigrations = (database: DatabaseSync): void => {
  for (const migration of storageMigrations) {
    recordMigration(database, migration)
  }
}

const initializeFreshSchema = (database: DatabaseSync) =>
  runSchemaTransaction(database, () => {
    database.exec(createCurrentSchemaV3Sql)
    database
      .prepare(`
        INSERT INTO storage_state (singleton, last_commit_sequence)
        VALUES (1, 0)
      `)
      .run()
    recordCurrentMigrations(database)
  })

const migrateLegacySingleton = (
  database: DatabaseSync,
  path: string,
) =>
  Effect.gen(function* () {
    yield* completeSqliteBackup(() =>
      backup(database, `${path}.pre-migration-v2.sqlite`),
    )
    yield* runSchemaTransaction(database, () => {
      database.exec(migrateLegacySingletonSql)
      recordMigration(database, currentMigration)
    })
  })

const validateLegacySingleton = Effect.fn(
  "SessionStorage.validateLegacySingleton",
)(function* (database: DatabaseSync) {
  const rows = yield* Effect.try({
    try: () =>
      database
        .prepare(`
          SELECT
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
          FROM current_session
        `)
        .all(),
    catch: () => storageError("SessionStorage.open"),
  })
  const decoded = yield* Schema.decodeUnknownEffect(
    Schema.Array(LegacySessionRow),
    { onExcessProperty: "error" },
  )(rows).pipe(
    Effect.mapError(() => storageError("SessionStorage.open")),
  )
  if (decoded.length > 1) {
    return yield* storageError("SessionStorage.open")
  }
  return decoded
})

const inspectCurrentMigration = Effect.fn("SessionStorage.verifyMigration")(
  function* (database: DatabaseSync) {
    const rows = yield* Effect.try({
      try: () =>
        database
          .prepare("SELECT version, checksum FROM schema_migrations ORDER BY version")
          .all(),
      catch: () => storageError("SessionStorage.open"),
    })
    const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(MigrationRow), {
      onExcessProperty: "error",
    })(rows).pipe(
      Effect.mapError(() => storageError("SessionStorage.open")),
    )
    if (decoded.length === 0 || decoded.length > storageMigrations.length) {
      return yield* storageError("SessionStorage.open")
    }

    for (const [index, row] of decoded.entries()) {
      const expected = storageMigrations[index]
      if (
        expected === undefined ||
        row.version !== expected.version ||
        row.checksum !== expected.checksum
      ) {
        return yield* storageError("SessionStorage.open")
      }
    }

    return decoded.length === 1 ? 2 as const : 3 as const
  },
)

interface CurrentStorageSnapshot {
  readonly rows: ReadonlyArray<SessionRow>
  readonly lastCommitSequence: number
}

const upgradeVersion2Row = (row: Version2SessionRow): SessionRow => ({
  protocol_version: 2,
  session_id: row.session_id,
  project_identity: row.project_identity,
  activity: row.activity,
  evidence_source: row.evidence_source,
  state_tag: row.state_tag,
  freshness: "fresh",
  provenance_tag: "Observed",
  retention_reason: null,
  source_updated_at_ms: row.source_updated_at_ms,
  observed_at_ms: row.observed_at_ms,
  commit_sequence: row.commit_sequence,
})

const readCurrentStorageSnapshot = Effect.fn(
  "SessionStorage.readCurrentSnapshot",
)(function* (
  database: DatabaseSync,
  version: 2 | 3,
) {
  const stored = yield* Effect.try({
    try: () => ({
      rows: database
        .prepare(`
          SELECT *
          FROM current_sessions
          ORDER BY session_id COLLATE BINARY
        `)
        .all(),
      state: database
        .prepare(`
          SELECT singleton, last_commit_sequence
          FROM storage_state
          WHERE singleton = 1
        `)
        .get(),
    }),
    catch: () => storageError("SessionStorage.open"),
  })
  const rows = version === 2
    ? yield* Schema.decodeUnknownEffect(
        Schema.Array(Version2SessionRow),
        { onExcessProperty: "error" },
      )(stored.rows).pipe(
        Effect.mapError(() => storageError("SessionStorage.open")),
        Effect.map((decoded) => decoded.map(upgradeVersion2Row)),
      )
    : yield* Schema.decodeUnknownEffect(
        Schema.Array(SessionRow),
        { onExcessProperty: "error" },
      )(stored.rows).pipe(
        Effect.mapError(() => storageError("SessionStorage.open")),
      )
  const state = yield* Schema.decodeUnknownEffect(StorageStateRow, {
    onExcessProperty: "error",
  })(stored.state).pipe(
    Effect.mapError(() => storageError("SessionStorage.open")),
  )
  if (
    rows.some(
      (row) => row.commit_sequence > state.last_commit_sequence,
    )
  ) {
    return yield* storageError("SessionStorage.open")
  }
  return {
    rows,
    lastCommitSequence: state.last_commit_sequence,
  } satisfies CurrentStorageSnapshot
})

const migrateVersion2Overview = (
  database: DatabaseSync,
  path: string,
  backupVersion2: boolean = true,
) =>
  Effect.gen(function* () {
    yield* readCurrentStorageSnapshot(database, 2)
    if (backupVersion2) {
      yield* completeSqliteBackup(() =>
        backup(database, `${path}.pre-migration-v3.sqlite`),
      )
    }
    yield* runSchemaTransaction(database, () => {
      database.exec(migrateVersion2OverviewSql)
      recordMigration(database, retainedProjectionMigration)
    })
  })

const prepareStorageSchema = Effect.fn("SessionStorage.prepareSchema")(
  function* (
    database: DatabaseSync,
    path: string,
  ) {
    const schema = yield* inspectStorageSchema(database)
    if (schema === "fresh") {
      yield* initializeFreshSchema(database)
      return
    }
    if (schema === "legacy-singleton") {
      yield* validateLegacySingleton(database)
      yield* migrateLegacySingleton(database, path)
      yield* migrateVersion2Overview(database, path, false)
      return
    }
    const version = yield* inspectCurrentMigration(database)
    if (version === 2) {
      yield* migrateVersion2Overview(database, path)
    }
  },
)

interface ImportedStorageSnapshot {
  readonly schema: "fresh" | "legacy-singleton" | "current"
  readonly rows: ReadonlyArray<SessionRow>
  readonly lastCommitSequence: number
}

const readImportSnapshot = (path: string) =>
  Effect.acquireUseRelease(
    openLegacyImportSource(path),
    (database) =>
      Effect.gen(function* () {
        const schema = yield* inspectStorageSchema(database)
        if (schema === "fresh") {
          return {
            schema,
            rows: [],
            lastCommitSequence: 0,
          } satisfies ImportedStorageSnapshot
        }
        if (schema === "legacy-singleton") {
          const legacyRows = yield* validateLegacySingleton(database)
          const rows = legacyRows.map(upgradeVersion2Row)
          return {
            schema,
            rows,
            lastCommitSequence: rows[0]?.commit_sequence ?? 0,
          } satisfies ImportedStorageSnapshot
        }

        const version = yield* inspectCurrentMigration(database)
        const stored = yield* readCurrentStorageSnapshot(database, version)
        return {
          schema,
          rows: stored.rows,
          lastCommitSequence: stored.lastCommitSequence,
        } satisfies ImportedStorageSnapshot
      }),
    (database) => Effect.sync(() => database.close()),
  )

const initializeFreshSchemaFromSnapshot = (
  database: DatabaseSync,
  snapshot: ImportedStorageSnapshot,
) =>
  runSchemaTransaction(database, () => {
    database.exec(createCurrentSchemaV3Sql)
    const insert = database.prepare(`
      INSERT INTO current_sessions (
        protocol_version,
        session_id,
        project_identity,
        activity,
        evidence_source,
        state_tag,
        freshness,
        provenance_tag,
        retention_reason,
        source_updated_at_ms,
        observed_at_ms,
        commit_sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const row of snapshot.rows) {
      insert.run(
        row.protocol_version,
        row.session_id,
        row.project_identity,
        row.activity,
        row.evidence_source,
        row.state_tag,
        row.freshness,
        row.provenance_tag,
        row.retention_reason,
        row.source_updated_at_ms,
        row.observed_at_ms,
        row.commit_sequence,
      )
    }
    database
      .prepare(`
        INSERT INTO storage_state (singleton, last_commit_sequence)
        VALUES (1, ?)
      `)
      .run(snapshot.lastCommitSequence)
    recordCurrentMigrations(database)
  })

const importLegacySnapshotIntoOwnedDatabase = (
  database: DatabaseSync,
  legacyPath: string,
  currentPath: string,
) => {
  const importToken = randomUUID()
  const snapshotPath = `${currentPath}.import-${importToken}`
  const retainedBackupPath = `${currentPath}.pre-migration-v2.sqlite`
  const retainedBackupStagingPath = `${retainedBackupPath}.import-${importToken}`

  return Effect.acquireUseRelease(
    Effect.succeed(snapshotPath),
    () =>
      Effect.gen(function* () {
        yield* Effect.acquireUseRelease(
          openLegacyImportSource(legacyPath),
          (legacyDatabase) =>
            completeSqliteBackup(() =>
              backup(legacyDatabase, snapshotPath),
            ),
          (legacyDatabase) => Effect.sync(() => legacyDatabase.close()),
        )

        const snapshot = yield* readImportSnapshot(snapshotPath)
        if (snapshot.schema === "legacy-singleton") {
          if (existsSync(retainedBackupPath)) {
            const retained = yield* readImportSnapshot(retainedBackupPath)
            if (retained.schema !== "legacy-singleton") {
              return yield* storageError("SessionStorage.open")
            }
          } else {
            yield* Effect.try({
              try: () => {
                copyFileSync(
                  snapshotPath,
                  retainedBackupStagingPath,
                  FsConstants.COPYFILE_EXCL,
                )
                renameSync(retainedBackupStagingPath, retainedBackupPath)
              },
              catch: () => storageError("SessionStorage.open"),
            })
          }
        }

        yield* initializeFreshSchemaFromSnapshot(database, snapshot)
      }),
    () =>
      Effect.gen(function* () {
        yield* removeImportStaging(snapshotPath)
        yield* removeImportStaging(retainedBackupStagingPath)
      }),
  )
}

const rejectAliasedStoragePaths = (
  legacyPath: string,
  currentPath: string,
) =>
  Effect.try({
    try: () => {
      if (!existsSync(legacyPath) || !existsSync(currentPath)) return

      const legacy = statSync(legacyPath, { bigint: true })
      const current = statSync(currentPath, { bigint: true })
      if (
        legacy.dev === current.dev &&
        legacy.ino === current.ino
      ) {
        throw new Error("Legacy and versioned storage resolve to one file")
      }
    },
    catch: () => storageError("SessionStorage.open"),
  })

const openConfiguredDatabase = (path: string) =>
  Effect.try({
    try: () => {
      const database = new DatabaseSync(path, {
        allowBareNamedParameters: false,
        allowExtension: false,
        allowUnknownNamedParameters: false,
        defensive: true,
        enableDoubleQuotedStringLiterals: false,
        enableForeignKeyConstraints: true,
        readBigInts: false,
        returnArrays: false,
        timeout: 2_000,
      })

      try {
        database.enableDefensive(true)
        database.enableLoadExtension(false)
        database.exec("PRAGMA locking_mode = EXCLUSIVE")
        database.exec("BEGIN IMMEDIATE; COMMIT")
        database.exec("PRAGMA foreign_keys = ON")
        database.exec("PRAGMA journal_mode = WAL")
        database.exec("PRAGMA synchronous = FULL")
        database.exec("PRAGMA busy_timeout = 2000")
        database.exec("PRAGMA trusted_schema = OFF")

        const settings = database
          .prepare(`
            SELECT
              (SELECT locking_mode FROM pragma_locking_mode) AS locking_mode,
              (SELECT foreign_keys FROM pragma_foreign_keys) AS foreign_keys,
              (SELECT journal_mode FROM pragma_journal_mode) AS journal_mode,
              (SELECT synchronous FROM pragma_synchronous) AS synchronous,
              (SELECT timeout FROM pragma_busy_timeout) AS busy_timeout,
              (SELECT trusted_schema FROM pragma_trusted_schema) AS trusted_schema
          `)
          .get()

        if (
          settings?.locking_mode !== "exclusive" ||
          settings.foreign_keys !== 1 ||
          settings.journal_mode !== "wal" ||
          settings.synchronous !== 2 ||
          settings.busy_timeout !== 2_000 ||
          settings.trusted_schema !== 0
        ) {
          throw new Error("SQLite connection settings could not be verified")
        }

        return database
      } catch (error) {
        try {
          database.close()
        } catch {
          // Acquisition reports the original setup failure.
        }
        throw error
      }
    },
    catch: () => storageError("SessionStorage.open"),
  })

const openDatabase = (path: string, legacyPath?: string) =>
  Effect.gen(function* () {
    if (legacyPath !== undefined) {
      yield* rejectAliasedStoragePaths(legacyPath, path)
    }
    const database = yield* openConfiguredDatabase(path)
    const prepare = Effect.gen(function* () {
      const schema = yield* inspectStorageSchema(database)
      if (
        schema === "fresh" &&
        legacyPath !== undefined &&
        existsSync(legacyPath)
      ) {
        yield* importLegacySnapshotIntoOwnedDatabase(
          database,
          legacyPath,
          path,
        )
      } else {
        yield* prepareStorageSchema(database, path)
      }
      return database
    })
    return yield* prepare.pipe(
      Effect.as(database),
      Effect.onError(() =>
        Effect.sync(() => {
          database.close()
        }).pipe(Effect.ignore),
      ),
    )
  })

const decodeRow = (row: unknown) =>
  Schema.decodeUnknownEffect(SessionRow, { onExcessProperty: "error" })(row).pipe(
    Effect.mapError(() => storageError("SessionStorage.decodeRow")),
    Effect.map((decoded) =>
      SessionView.make({
        protocolVersion: decoded.protocol_version,
        sessionId: decoded.session_id,
        projectIdentity: decoded.project_identity,
        activity: decoded.activity,
        evidenceSource: decoded.evidence_source,
        state:
          decoded.state_tag === "Discovered"
            ? SessionState.cases.Discovered.make({})
            : SessionState.cases.Polled.make({}),
        freshness: decoded.freshness,
        provenance:
          decoded.provenance_tag === "Observed"
            ? SessionProvenance.cases.Observed.make({})
            : SessionProvenance.cases.Retained.make({
                reason: decoded.retention_reason,
              }),
        sourceUpdatedAtMs: decoded.source_updated_at_ms,
        observedAtMs: decoded.observed_at_ms,
        commitSequence: decoded.commit_sequence,
      }),
    ),
  )

const decodeCommitInput = Effect.fn("SessionStorage.decodeCommitInput")(
  function* (
    expectedPreviousCommitSequence: number,
    changedViews: ReadonlyArray<SessionView>,
  ) {
    const expected = yield* Schema.decodeUnknownEffect(NonNegativeSafeInteger)(
      expectedPreviousCommitSequence,
    ).pipe(Effect.mapError(() => storageError("SessionStorage.commit")))
    const views = yield* Schema.decodeUnknownEffect(Schema.Array(SessionView), {
      onExcessProperty: "error",
    })(changedViews).pipe(
      Effect.mapError(() => storageError("SessionStorage.commit")),
    )

    const identities = new Set<string>()
    for (const view of views) {
      if (identities.has(view.sessionId)) {
        return yield* storageError("SessionStorage.commit")
      }
      identities.add(view.sessionId)
    }

    const ordered = [...views].sort(
      (left, right) => left.commitSequence - right.commitSequence,
    )
    for (const [index, view] of ordered.entries()) {
      if (view.commitSequence !== expected + index + 1) {
        return yield* storageError("SessionStorage.commit")
      }
    }
    const next = expected + ordered.length
    yield* Schema.decodeUnknownEffect(NonNegativeSafeInteger)(next).pipe(
      Effect.mapError(() => storageError("SessionStorage.commit")),
    )

    return { expected, next, views: ordered }
  },
)

export const layer = (path: string, legacyPath?: string) =>
  Layer.effect(
    Service,
    Effect.acquireRelease(openDatabase(path, legacyPath), (database) =>
      Effect.sync(() => database.close()),
    ).pipe(
      Effect.map((database) => {
        const load = Effect.fn("SessionStorage.load")(function* () {
          const result = yield* Effect.try({
            try: () => {
              database.exec("BEGIN")
              try {
                const snapshot = {
                  rows: database
                    .prepare(`
                      SELECT *
                      FROM current_sessions
                      ORDER BY session_id COLLATE BINARY
                    `)
                    .all(),
                  state: database
                    .prepare(`
                      SELECT singleton, last_commit_sequence
                      FROM storage_state
                      WHERE singleton = 1
                    `)
                    .get(),
                }
                database.exec("COMMIT")
                return snapshot
              } catch (error) {
                try {
                  database.exec("ROLLBACK")
                } catch {
                  // The original read failure is the truthful storage result.
                }
                throw error
              }
            },
            catch: () => storageError("SessionStorage.load"),
          })
          const state = yield* Schema.decodeUnknownEffect(StorageStateRow, {
            onExcessProperty: "error",
          })(result.state).pipe(
            Effect.mapError(() => storageError("SessionStorage.decodeRow")),
          )
          const views = yield* Effect.forEach(result.rows, decodeRow)
          if (
            views.some(
              (view) => view.commitSequence > state.last_commit_sequence,
            )
          ) {
            return yield* storageError("SessionStorage.decodeRow")
          }

          return {
            views,
            lastCommitSequence: state.last_commit_sequence,
          }
        })

        const commit = Effect.fn("SessionStorage.commit")(function* (
          expectedPreviousCommitSequence: number,
          changedViews: ReadonlyArray<SessionView>,
        ) {
          const input = yield* decodeCommitInput(
            expectedPreviousCommitSequence,
            changedViews,
          )

          yield* Effect.try({
            try: () => {
              database.exec("BEGIN IMMEDIATE")
              try {
                const allocation = database
                  .prepare(`
                    UPDATE storage_state
                    SET last_commit_sequence = ?
                    WHERE singleton = 1 AND last_commit_sequence = ?
                  `)
                  .run(input.next, input.expected)
                if (allocation.changes !== 1) {
                  throw new Error("PackWalk commit sequence changed")
                }

                const upsert = database.prepare(`
                  INSERT INTO current_sessions (
                    session_id,
                    protocol_version,
                    project_identity,
                    activity,
                    evidence_source,
                    state_tag,
                    freshness,
                    provenance_tag,
                    retention_reason,
                    source_updated_at_ms,
                    observed_at_ms,
                    commit_sequence
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(session_id) DO UPDATE SET
                    protocol_version = excluded.protocol_version,
                    project_identity = excluded.project_identity,
                    activity = excluded.activity,
                    evidence_source = excluded.evidence_source,
                    state_tag = excluded.state_tag,
                    freshness = excluded.freshness,
                    provenance_tag = excluded.provenance_tag,
                    retention_reason = excluded.retention_reason,
                    source_updated_at_ms = excluded.source_updated_at_ms,
                    observed_at_ms = excluded.observed_at_ms,
                    commit_sequence = excluded.commit_sequence
                `)
                for (const view of input.views) {
                  upsert.run(
                    view.sessionId,
                    view.protocolVersion,
                    view.projectIdentity,
                    view.activity,
                    view.evidenceSource,
                    view.state._tag,
                    view.freshness,
                    view.provenance._tag,
                    view.provenance._tag === "Retained"
                      ? view.provenance.reason
                      : null,
                    view.sourceUpdatedAtMs,
                    view.observedAtMs,
                    view.commitSequence,
                  )
                }
                database.exec("COMMIT")
              } catch (error) {
                try {
                  database.exec("ROLLBACK")
                } catch {
                  // The original failure is the truthful storage result.
                }
                throw error
              }
            },
            catch: () => storageError("SessionStorage.commit"),
          })
        })

        return Service.of({ load, commit })
      }),
    ),
  )

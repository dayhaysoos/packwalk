import { DatabaseSync } from "node:sqlite"

import { Effect, Layer, Option, Schema } from "effect"

import {
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
  SessionState,
  SessionView,
} from "../domain/session.js"
import {
  makeProjectIdentityResolver,
  type ProjectIdentityResolver,
} from "./project-identity.js"

const CodexThreadRow = Schema.Struct({
  session_id: SessionIdentity,
  session_cwd: Identity,
  source_updated_at_ms: DateTimestampMs,
})

const SessionRow = Schema.Struct({
  singleton: Schema.Literal(1),
  protocol_version: Schema.Literal(1),
  session_id: SessionIdentity,
  project_identity: ProjectIdentity,
  activity: Schema.Literal("persisted Codex activity"),
  evidence_source: Schema.Literal("codex-sqlite-thread-index"),
  state_tag: Schema.Literals(["Discovered", "Polled"]),
  freshness: Schema.Literal("fresh"),
  source_updated_at_ms: DateTimestampMs,
  observed_at_ms: DateTimestampMs,
  commit_sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
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

const sourceError = (
  code: "unavailable" | "unsupported" | "invalid-evidence",
) =>
  new SessionSourceError({
    code,
    message: "Codex persisted evidence is unavailable or incompatible",
  })

const readCodexThread = Effect.fn("CodexSource.readThread")(function* (
  path: string,
  projectIdentityResolver: ProjectIdentityResolver,
  sessionId?: SessionIdentity,
) {
  const row = yield* Effect.try({
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
                ORDER BY updated_at_ms DESC, id DESC
                LIMIT 1
              `)
              .get()
          : database
              .prepare(`
                SELECT
                  id AS session_id,
                  cwd AS session_cwd,
                  updated_at_ms AS source_updated_at_ms
                FROM threads
                WHERE id = ? AND thread_source = 'user' AND archived = 0
                LIMIT 1
              `)
              .get(sessionId)
      } finally {
        database.close()
      }
    },
    catch: (error) =>
      error instanceof SessionSourceError ? error : sourceError("unavailable"),
  })

  if (row === undefined) {
    return yield* sourceError("unavailable")
  }

  const decoded = yield* Schema.decodeUnknownEffect(CodexThreadRow, {
    onExcessProperty: "error",
  })(row).pipe(
    Effect.mapError(() => sourceError("invalid-evidence")),
  )

  const projectIdentity = yield* projectIdentityResolver
    .resolve(decoded.session_cwd)
    .pipe(
      Effect.mapError(() => sourceError("invalid-evidence")),
    )

  return CodexPersistedFact.make({
    version: 1,
    sessionId: decoded.session_id,
    projectIdentity,
    sourceUpdatedAtMs: decoded.source_updated_at_ms,
  })
})

export const codexSourceLayer = (path: string) =>
  Layer.effect(
    SessionSource,
    Effect.gen(function* () {
      const projectIdentityResolver = yield* makeProjectIdentityResolver

      return SessionSource.of({
        discover: () => readCodexThread(path, projectIdentityResolver),
        poll: (sessionId) =>
          readCodexThread(path, projectIdentityResolver, sessionId),
      })
    }),
  )

const openDatabase = (path: string) =>
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
        database.exec("PRAGMA foreign_keys = ON")
        database.exec("PRAGMA journal_mode = WAL")
        database.exec("PRAGMA synchronous = FULL")
        database.exec("PRAGMA busy_timeout = 2000")
        database.exec("PRAGMA trusted_schema = OFF")
        database.exec(`
          CREATE TABLE IF NOT EXISTS current_session (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
            session_id TEXT NOT NULL,
            project_identity TEXT NOT NULL,
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
            commit_sequence INTEGER NOT NULL CHECK (
              commit_sequence >= 1 AND commit_sequence <= 9007199254740991
            )
          )
        `)

        const settings = database
          .prepare(`
            SELECT
              (SELECT foreign_keys FROM pragma_foreign_keys) AS foreign_keys,
              (SELECT journal_mode FROM pragma_journal_mode) AS journal_mode,
              (SELECT synchronous FROM pragma_synchronous) AS synchronous,
              (SELECT timeout FROM pragma_busy_timeout) AS busy_timeout,
              (SELECT trusted_schema FROM pragma_trusted_schema) AS trusted_schema
          `)
          .get()

        if (
          settings?.foreign_keys !== 1 ||
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
        sourceUpdatedAtMs: decoded.source_updated_at_ms,
        observedAtMs: decoded.observed_at_ms,
        commitSequence: decoded.commit_sequence,
      }),
    ),
  )

export const layer = (path: string) =>
  Layer.effect(
    Service,
    Effect.acquireRelease(openDatabase(path), (database) =>
      Effect.sync(() => database.close()),
    ).pipe(
      Effect.map((database) => {
        const load = Effect.fn("SessionStorage.load")(function* () {
          const row = yield* Effect.try({
            try: () =>
              database.prepare("SELECT * FROM current_session WHERE singleton = 1").get(),
            catch: () => storageError("SessionStorage.load"),
          })

          return row === undefined ? Option.none() : Option.some(yield* decodeRow(row))
        })

        const commit = Effect.fn("SessionStorage.commit")(function* (view: SessionView) {
          yield* Effect.try({
            try: () => {
              database.exec("BEGIN IMMEDIATE")
              try {
                database
                  .prepare(`
                    INSERT INTO current_session (
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
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(singleton) DO UPDATE SET
                      protocol_version = excluded.protocol_version,
                      session_id = excluded.session_id,
                      project_identity = excluded.project_identity,
                      activity = excluded.activity,
                      evidence_source = excluded.evidence_source,
                      state_tag = excluded.state_tag,
                      freshness = excluded.freshness,
                      source_updated_at_ms = excluded.source_updated_at_ms,
                      observed_at_ms = excluded.observed_at_ms,
                      commit_sequence = excluded.commit_sequence
                  `)
                  .run(
                    view.protocolVersion,
                    view.sessionId,
                    view.projectIdentity,
                    view.activity,
                    view.evidenceSource,
                    view.state._tag,
                    view.freshness,
                    view.sourceUpdatedAtMs,
                    view.observedAtMs,
                    view.commitSequence,
                  )
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

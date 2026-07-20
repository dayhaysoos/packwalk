import { DatabaseSync } from "node:sqlite"

import { Effect } from "effect"

import { SessionSourceError } from "../../src/application/session-source.js"

export interface CodexIndexFixture {
  readonly sessionId: string
  readonly projectIdentity: string
  readonly sourceUpdatedAtMs: number
  readonly forbiddenContent: string
}

export type CodexIndexFixtureInput =
  | CodexIndexFixture
  | ReadonlyArray<CodexIndexFixture>

const isFixtureArray = (
  input: CodexIndexFixtureInput,
): input is ReadonlyArray<CodexIndexFixture> => Array.isArray(input)

const asFixtureArray = (
  input: CodexIndexFixtureInput,
): ReadonlyArray<CodexIndexFixture> =>
  isFixtureArray(input) ? input : [input]

const fixtureError = () =>
  new SessionSourceError({
    code: "unavailable",
    message: "Codex persisted evidence is unavailable or incompatible",
  })

export const createCodexIndexFixture = Effect.fn("CodexIndexFixture.create")(
  function* (path: string, input: CodexIndexFixtureInput) {
    yield* Effect.try({
      try: () => {
        const database = new DatabaseSync(path, {
          allowExtension: false,
          defensive: true,
          readBigInts: false,
        })
        try {
          database.exec(`
            CREATE TABLE threads (
              id TEXT NOT NULL,
              cwd TEXT NOT NULL,
              updated_at_ms INTEGER NOT NULL,
              archived INTEGER NOT NULL,
              thread_source TEXT NOT NULL,
              title TEXT,
              first_user_message TEXT,
              preview TEXT
            )
          `)
          const insert = database.prepare(`
              INSERT INTO threads (
                id,
                cwd,
                updated_at_ms,
                archived,
                thread_source,
                title,
                first_user_message,
                preview
              ) VALUES (?, ?, ?, 0, 'user', ?, ?, ?)
            `)
          for (const fixture of asFixtureArray(input)) {
            insert.run(
              fixture.sessionId,
              fixture.projectIdentity,
              fixture.sourceUpdatedAtMs,
              fixture.forbiddenContent,
              fixture.forbiddenContent,
              fixture.forbiddenContent,
            )
          }
        } finally {
          database.close()
        }
      },
      catch: fixtureError,
    })
  },
)

export const updateCodexIndexFixture = Effect.fn("CodexIndexFixture.update")(
  function* (path: string, sessionId: string, sourceUpdatedAtMs: number) {
    yield* Effect.try({
      try: () => {
        const database = new DatabaseSync(path, {
          allowExtension: false,
          defensive: true,
          readBigInts: false,
        })
        try {
          const result = database
            .prepare("UPDATE threads SET updated_at_ms = ? WHERE id = ?")
            .run(sourceUpdatedAtMs, sessionId)
          if (result.changes !== 1) {
            throw new Error("Expected one exact Codex session fixture update")
          }
        } finally {
          database.close()
        }
      },
      catch: fixtureError,
    })
  },
)

export const replaceCodexIndexFixture = Effect.fn("CodexIndexFixture.replace")(
  function* (
    path: string,
    currentSessionId: string,
    replacement: Omit<CodexIndexFixture, "forbiddenContent">,
  ) {
    yield* Effect.try({
      try: () => {
        const database = new DatabaseSync(path, {
          allowExtension: false,
          defensive: true,
          readBigInts: false,
        })
        try {
          const result = database
            .prepare(`
              UPDATE threads
              SET id = ?, cwd = ?, updated_at_ms = ?
              WHERE id = ?
            `)
            .run(
              replacement.sessionId,
              replacement.projectIdentity,
              replacement.sourceUpdatedAtMs,
              currentSessionId,
            )
          if (result.changes !== 1) {
            throw new Error("Expected one exact Codex session fixture replacement")
          }
        } finally {
          database.close()
        }
      },
      catch: fixtureError,
    })
  },
)

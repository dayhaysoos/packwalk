import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"

import { SessionCommand } from "../src/adapters/local-session-ipc.js"
import {
  MaximumSessionEventBytes,
  ProjectIdentity,
  SessionEvent,
  SessionIdentity,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const discovered = SessionView.make({
  protocolVersion: 1,
  sessionId: SessionIdentity.make(sessionId),
  projectIdentity: ProjectIdentity.make("fixture-project"),
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: SessionState.cases.Discovered.make({}),
  freshness: "fresh",
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
})

const secondSessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ac"
const secondDiscovered = SessionView.make({
  ...discovered,
  sessionId: SessionIdentity.make(secondSessionId),
  commitSequence: 2,
})

const decodeStrict = <S extends Schema.Constraint>(schema: S) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })

it.effect("decodes the legacy singleton and current overview IPC variants", () =>
  Effect.gen(function* () {
    const inputs = [
      SessionEvent.cases.SessionSnapshot.make({
        protocolVersion: 1,
        view: discovered,
      }),
      SessionEvent.cases.SessionUpdated.make({
        protocolVersion: 1,
        view: SessionView.make({
          ...discovered,
          state: SessionState.cases.Polled.make({}),
          sourceUpdatedAtMs: 2_500,
          observedAtMs: 3_000,
          commitSequence: 2,
        }),
      }),
      SessionEvent.cases.SessionUnavailable.make({
        protocolVersion: 1,
        code: "source-unavailable",
        message: "PackWalk could not read supported Codex persisted evidence",
      }),
      SessionEvent.cases.SessionUnavailable.make({
        protocolVersion: 1,
        code: "source-incompatible",
        message: "PackWalk could not read supported Codex persisted evidence",
      }),
      SessionEvent.cases.SessionUnavailable.make({
        protocolVersion: 1,
        code: "storage-unavailable",
        message: "PackWalk could not commit its current session view",
      }),
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 2,
        views: [discovered, secondDiscovered],
      }),
      SessionEvent.cases.SessionsUpdated.make({
        protocolVersion: 2,
        views: [
          SessionView.make({
            ...discovered,
            state: SessionState.cases.Polled.make({}),
            sourceUpdatedAtMs: 2_500,
            observedAtMs: 3_000,
            commitSequence: 3,
          }),
          secondDiscovered,
        ],
        changedSessionIds: [SessionIdentity.make(sessionId)],
      }),
    ]

    for (const input of inputs) {
      const result = yield* decodeStrict(SessionEvent)(input).pipe(Effect.result)
      expect(Result.isSuccess(result)).toBe(true)
    }

    const command = yield* decodeStrict(SessionCommand)({
      _tag: "SubscribeSessions",
      protocolVersion: 2,
    })
    expect(command._tag).toBe("SubscribeSessions")
  }),
)

it.effect("fails closed on unknown, version-mismatched, or content-bearing IPC values", () =>
  Effect.gen(function* () {
    const forbidden = "synthetic-secret-prompt"
    const invalidInputs = [
      { _tag: "UnknownSessionEvent", protocolVersion: 1 },
      {
        _tag: "SessionSnapshot",
        protocolVersion: 2,
        view: discovered,
      },
      {
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: { ...discovered, prompt: forbidden },
      },
      {
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: { ...discovered, state: { _tag: "Watched" } },
      },
      {
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: { ...discovered, sessionId: "" },
      },
      {
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: { ...discovered, commitSequence: Number.MAX_SAFE_INTEGER + 1 },
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 1,
        views: [discovered, secondDiscovered],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [discovered, { ...secondDiscovered, sessionId }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [discovered, { ...secondDiscovered, commitSequence: 1 }],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 2,
        views: [discovered, secondDiscovered],
        changedSessionIds: [],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 2,
        views: [discovered, secondDiscovered],
        changedSessionIds: [
          "019f77d2-1a10-7cf0-b5df-76eebb4071ad",
        ],
      },
    ]

    for (const input of invalidInputs) {
      const result = yield* decodeStrict(SessionEvent)(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }

    for (const command of [
      { _tag: "UnknownCommand", protocolVersion: 1 },
      { _tag: "SubscribeSession", protocolVersion: 1 },
      { _tag: "SubscribeSession", protocolVersion: 2 },
      {
        _tag: "SubscribeSession",
        protocolVersion: 1,
        prompt: forbidden,
      },
      { _tag: "SubscribeSessions", protocolVersion: 1 },
    ]) {
      const result = yield* decodeStrict(SessionCommand)(command).pipe(
        Effect.result,
      )
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

it("keeps the worst-case accepted identity encoding within one event frame", () => {
  const identity = "\u0000".repeat(4_096)
  const event = SessionEvent.cases.SessionSnapshot.make({
    protocolVersion: 1,
    view: SessionView.make({
      ...discovered,
      sessionId: SessionIdentity.make(identity),
      projectIdentity: ProjectIdentity.make(identity),
    }),
  })

  expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(
    MaximumSessionEventBytes,
  )
})

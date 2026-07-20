import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"

import { SessionCommand } from "../src/adapters/local-session-ipc.js"
import {
  MaximumSessionEventBytes,
  ProjectIdentity,
  SessionEvent,
  SessionIdentity,
  SessionProvenance,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const discovered = SessionView.make({
  protocolVersion: 2,
  sessionId: SessionIdentity.make(sessionId),
  projectIdentity: ProjectIdentity.make("fixture-project"),
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: SessionState.cases.Discovered.make({}),
  freshness: "fresh",
  provenance: SessionProvenance.cases.Observed.make({}),
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

const retained = SessionView.make({
  ...discovered,
  state: SessionState.cases.Polled.make({}),
  freshness: "stale",
  provenance: SessionProvenance.cases.Retained.make({
    reason: "source-unavailable",
  }),
  commitSequence: 3,
})

const legacyViewV1 = {
  protocolVersion: 1,
  sessionId,
  projectIdentity: "fixture-project",
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: { _tag: "Discovered" },
  freshness: "fresh",
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
} as const

const decodeStrict = <S extends Schema.Constraint>(schema: S) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })

it.effect("decodes only current protocol-v3 overview variants", () =>
  Effect.gen(function* () {
    const inputs = [
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 3,
        views: [discovered, secondDiscovered],
      }),
      SessionEvent.cases.SessionsUpdated.make({
        protocolVersion: 3,
        views: [retained, secondDiscovered],
        changedSessionIds: [SessionIdentity.make(sessionId)],
      }),
      SessionEvent.cases.SessionUnavailable.make({
        protocolVersion: 3,
        code: "source-unavailable",
        message: "PackWalk could not read supported Codex persisted evidence",
      }),
      SessionEvent.cases.SessionUnavailable.make({
        protocolVersion: 3,
        code: "storage-unavailable",
        message: "PackWalk could not commit its current session view",
      }),
    ]

    for (const input of inputs) {
      const result = yield* decodeStrict(SessionEvent)(input).pipe(Effect.result)
      expect(Result.isSuccess(result)).toBe(true)
    }

    const command = yield* decodeStrict(SessionCommand)({
      _tag: "SubscribeSessions",
      protocolVersion: 3,
    })
    expect(command._tag).toBe("SubscribeSessions")
  }),
)

it.effect("rejects raw legacy v1 and v2 events and commands", () =>
  Effect.gen(function* () {
    const legacyEvents = [
      {
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: legacyViewV1,
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [legacyViewV1],
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "source-unavailable",
        message: "PackWalk could not read supported Codex persisted evidence",
      },
    ]

    for (const input of legacyEvents) {
      const result = yield* decodeStrict(SessionEvent)(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }

    for (const command of [
      { _tag: "SubscribeSession", protocolVersion: 1 },
      { _tag: "SubscribeSessions", protocolVersion: 1 },
      { _tag: "SubscribeSessions", protocolVersion: 2 },
    ]) {
      const result = yield* decodeStrict(SessionCommand)(command).pipe(
        Effect.result,
      )
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

it.effect("fails closed on unknown, mismatched, or content-bearing current values", () =>
  Effect.gen(function* () {
    const forbidden = "synthetic-secret-prompt"
    const invalidInputs = [
      { _tag: "UnknownSessionEvent", protocolVersion: 3 },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [discovered],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [{ ...discovered, prompt: forbidden }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [{ ...discovered, state: { _tag: "Watched" } }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [{ ...discovered, freshness: "stale" }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [{
          ...discovered,
          provenance: { _tag: "Retained", reason: "source-incompatible" },
        }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [{ ...discovered, sessionId: "" }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [{
          ...discovered,
          commitSequence: Number.MAX_SAFE_INTEGER + 1,
        }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [discovered, { ...secondDiscovered, sessionId }],
      },
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [discovered, { ...secondDiscovered, commitSequence: 1 }],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
        views: [discovered, secondDiscovered],
        changedSessionIds: [],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
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
      { _tag: "UnknownCommand", protocolVersion: 3 },
      { _tag: "SubscribeSession", protocolVersion: 3 },
      {
        _tag: "SubscribeSessions",
        protocolVersion: 3,
        prompt: forbidden,
      },
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
  const event = SessionEvent.cases.SessionsSnapshot.make({
    protocolVersion: 3,
    views: [
      SessionView.make({
        ...discovered,
        sessionId: SessionIdentity.make(identity),
        projectIdentity: ProjectIdentity.make(identity),
      }),
    ],
  })

  expect(Buffer.byteLength(JSON.stringify(event), "utf8")).toBeLessThanOrEqual(
    MaximumSessionEventBytes,
  )
})

import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"

import {
  CodexPersistedFact,
  MaximumSessionEventBytes,
  ProjectIdentity,
  SessionIdentity,
  SessionProtocolEventJson,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

it.effect("rejects unsafe identities and counters at owned domain boundaries", () =>
  Effect.gen(function* () {
    const validFact = {
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    }
    const invalidFacts = [
      { ...validFact, sessionId: "" },
      { ...validFact, sessionId: "a".repeat(4_097) },
      { ...validFact, projectIdentity: "" },
      { ...validFact, projectIdentity: "€".repeat(1_366) },
      { ...validFact, sourceUpdatedAtMs: -1 },
      { ...validFact, sourceUpdatedAtMs: 1.5 },
      { ...validFact, sourceUpdatedAtMs: Number.MAX_SAFE_INTEGER + 1 },
    ]

    const validView = {
      protocolVersion: 2,
      sessionId,
      projectIdentity: "fixture-project",
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: { _tag: "Discovered" },
      freshness: "fresh",
      provenance: { _tag: "Observed" },
      sourceUpdatedAtMs: 1_000,
      observedAtMs: 2_000,
      commitSequence: 1,
    }
    const invalidViews = [
      { ...validView, sessionId: "" },
      { ...validView, sessionId: "a".repeat(4_097) },
      { ...validView, projectIdentity: "" },
      { ...validView, projectIdentity: "€".repeat(1_366) },
      { ...validView, sourceUpdatedAtMs: -1 },
      { ...validView, sourceUpdatedAtMs: 1.5 },
      { ...validView, sourceUpdatedAtMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...validView, observedAtMs: -1 },
      { ...validView, observedAtMs: 1.5 },
      { ...validView, observedAtMs: Number.MAX_SAFE_INTEGER + 1 },
      { ...validView, commitSequence: 0 },
      { ...validView, commitSequence: 1.5 },
      { ...validView, commitSequence: Number.MAX_SAFE_INTEGER + 1 },
      { ...validView, freshness: "stale" },
      {
        ...validView,
        provenance: { _tag: "Retained", reason: "source-unavailable" },
      },
      {
        ...validView,
        freshness: "stale",
        provenance: { _tag: "Observed" },
      },
      {
        ...validView,
        freshness: "stale",
        provenance: { _tag: "Retained", reason: "unknown-source-state" },
      },
    ]

    for (const fact of invalidFacts) {
      expect(
        yield* Effect.flip(
          Schema.decodeUnknownEffect(CodexPersistedFact, {
            onExcessProperty: "error",
          })(fact),
        ),
      ).toBeDefined()
    }
    for (const view of invalidViews) {
      expect(
        yield* Effect.flip(
          Schema.decodeUnknownEffect(SessionView, {
            onExcessProperty: "error",
          })(view),
        ),
      ).toBeDefined()
    }
  }),
)

it.effect("accepts an identity at the 4 KiB UTF-8 contract boundary", () =>
  Effect.gen(function* () {
    const boundaryIdentity = "€".repeat(1_365) + "a"
    const fact = yield* Schema.decodeUnknownEffect(CodexPersistedFact, {
      onExcessProperty: "error",
    })({
      version: 1,
      sessionId: boundaryIdentity,
      projectIdentity: boundaryIdentity,
      sourceUpdatedAtMs: 1_000,
    })

    expect(new TextEncoder().encode(fact.sessionId).byteLength).toBe(4_096)
    expect(new TextEncoder().encode(fact.projectIdentity).byteLength).toBe(
      4_096,
    )
  }),
)

it.effect("accepts only timestamps representable by JavaScript Date", () =>
  Effect.gen(function* () {
    const maximumDateTimestampMs = 8_640_000_000_000_000
    const fact = yield* Schema.decodeUnknownEffect(CodexPersistedFact, {
      onExcessProperty: "error",
    })({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: maximumDateTimestampMs,
    })
    const view = yield* Schema.decodeUnknownEffect(SessionView, {
      onExcessProperty: "error",
    })({
      protocolVersion: 2,
      sessionId,
      projectIdentity: "fixture-project",
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: { _tag: "Discovered" },
      freshness: "fresh",
      provenance: { _tag: "Observed" },
      sourceUpdatedAtMs: maximumDateTimestampMs,
      observedAtMs: maximumDateTimestampMs,
      commitSequence: 1,
    })

    expect(new Date(fact.sourceUpdatedAtMs).toISOString()).toBe(
      "+275760-09-13T00:00:00.000Z",
    )
    expect(new Date(view.observedAtMs).toISOString()).toBe(
      "+275760-09-13T00:00:00.000Z",
    )

    for (const schemaAndValue of [
      [
        CodexPersistedFact,
        {
          version: 1,
          sessionId,
          projectIdentity: "fixture-project",
          sourceUpdatedAtMs: maximumDateTimestampMs + 1,
        },
      ],
      [
        SessionView,
        {
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Discovered" },
          freshness: "fresh",
          provenance: { _tag: "Observed" },
          sourceUpdatedAtMs: maximumDateTimestampMs,
          observedAtMs: maximumDateTimestampMs + 1,
          commitSequence: 1,
        },
      ],
    ] as const) {
      expect(
        yield* Effect.flip(
          Schema.decodeUnknownEffect(schemaAndValue[0], {
            onExcessProperty: "error",
          })(schemaAndValue[1]),
        ),
      ).toBeDefined()
    }
  }),
)

it.effect("rejects otherwise-valid protocol-v3 overviews above the public frame limit", () =>
  Effect.gen(function* () {
    const escapedIdentityPrefix = "\0".repeat(4_090)
    const maximumProjectIdentity = ProjectIdentity.make("\0".repeat(4_096))
    const views = Array.from({ length: 85 }, (_, index) =>
      SessionView.make({
        protocolVersion: 2,
        sessionId: SessionIdentity.make(
          `${escapedIdentityPrefix}${String(index).padStart(6, "0")}`,
        ),
        projectIdentity: maximumProjectIdentity,
        activity: "persisted Codex activity",
        evidenceSource: "codex-sqlite-thread-index",
        state: SessionState.cases.Discovered.make({}),
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 2_000,
        commitSequence: index + 1,
      }),
    )
    const lastView = views[84]
    if (lastView === undefined) return yield* Effect.die("missing fixture view")

    const overviews = [
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views,
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
        views,
        changedSessionIds: [lastView.sessionId],
      },
    ] as const

    for (const overview of overviews) {
      const encoded = JSON.stringify(overview)
      expect(new TextEncoder().encode(encoded).byteLength)
        .toBeGreaterThan(MaximumSessionEventBytes)
      const decoded = yield* Schema.decodeUnknownEffect(
        SessionProtocolEventJson,
        { onExcessProperty: "error" },
      )(encoded).pipe(Effect.result)
      const reencoded = yield* Schema.encodeUnknownEffect(
        SessionProtocolEventJson,
        { onExcessProperty: "error" },
      )(overview).pipe(Effect.result)

      expect(Result.isFailure(decoded)).toBe(true)
      expect(Result.isFailure(reencoded)).toBe(true)
    }
  }),
)

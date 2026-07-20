import { expect, it } from "@effect/vitest"
import { Effect, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"

import {
  OneShotSessionError,
  runOneShotSessionClient,
  type OneShotClientPort,
} from "../src/client/one-shot-session-client.js"
import {
  ProjectIdentity,
  SessionEvent,
  SessionIdentity,
  SessionProvenance,
  SessionState,
  SessionView,
} from "../src/domain/session.js"
import { makeDeterministicPackWalk } from "./support/deterministic-packwalk.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const discovered = SessionView.make({
  protocolVersion: 2,
  sessionId: SessionIdentity.make(sessionId),
  projectIdentity: ProjectIdentity.make("C:\\work\\fixture-project"),
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: SessionState.cases.Discovered.make({}),
  freshness: "fresh",
  provenance: SessionProvenance.cases.Observed.make({}),
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
})

const snapshot = SessionEvent.cases.SessionsSnapshot.make({
  protocolVersion: 4,
  views: [discovered],
})

const captureOutput = Effect.gen(function* () {
  const documents = yield* Ref.make<ReadonlyArray<string>>([])
  const output: OneShotClientPort = {
    writeDocument: (document) =>
      Ref.update(documents, (current) => [...current, document]),
  }
  return { documents, output }
})

it.effect("writes one platform-native plain-text document from the first public daemon event", () =>
  Effect.gen(function* () {
    const capture = yield* captureOutput
    const finalized = yield* Ref.make(false)
    const polled = SessionView.make({
      ...discovered,
      state: SessionState.cases.Polled.make({}),
      sourceUpdatedAtMs: 2_500,
      observedAtMs: 3_000,
      commitSequence: 2,
    })
    const later = SessionEvent.cases.SessionsUpdated.make({
      protocolVersion: 4,
      views: [polled],
      changedSessionIds: [SessionIdentity.make(sessionId)],
    })

    yield* runOneShotSessionClient(
      Stream.make(snapshot, later).pipe(
        Stream.ensuring(Ref.set(finalized, true)),
      ),
      capture.output,
      { format: "text", lineSeparator: "\r\n" },
    )

    const rendered = yield* Ref.get(capture.documents)
    expect(rendered).toHaveLength(1)
    expect(rendered[0]).toContain("fixture-project")
    expect(rendered[0]).toContain(sessionId)
    expect(rendered[0]).toContain("persisted Codex activity")
    expect(rendered[0]).toContain("codex-sqlite-thread-index")
    expect(rendered[0]).toContain("fresh")
    expect(rendered[0]).toContain("OBSERVED")
    expect(rendered[0]).toContain("DISCOVERED")
    expect(rendered[0]).not.toContain("POLLED")
    expect(rendered[0]).not.toMatch(/(?<!\r)\n/u)
    expect(rendered[0]?.endsWith("\r\n")).toBe(true)
    expect(yield* Ref.get(finalized)).toBe(true)
  }),
)

it.effect("Effect-Schema encodes one versioned content-free JSON document with provenance", () =>
  Effect.gen(function* () {
    const capture = yield* captureOutput

    yield* runOneShotSessionClient(
      Stream.make(snapshot),
      capture.output,
      { format: "json", lineSeparator: "\n" },
    )

    const rendered = yield* Ref.get(capture.documents)
    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.endsWith("\n")).toBe(true)
    expect(JSON.parse(rendered[0] ?? "")).toEqual({
      _tag: "SessionsSnapshot",
      protocolVersion: 4,
      views: [{
        protocolVersion: 2,
        sessionId,
        projectIdentity: "C:\\work\\fixture-project",
        activity: "persisted Codex activity",
        evidenceSource: "codex-sqlite-thread-index",
        state: { _tag: "Discovered" },
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 2_000,
        commitSequence: 1,
      }],
    })
    expect(rendered[0]).not.toMatch(
      /prompt|response|commandOutput|diff|terminalInput|rawPayload/iu,
    )
  }),
)

it.effect("encodes source unavailability explicitly instead of omitting session data ambiguously", () =>
  Effect.gen(function* () {
    const capture = yield* captureOutput
    const unavailable = SessionEvent.cases.SessionUnavailable.make({
      protocolVersion: 4,
      code: "source-unavailable",
      message: "PackWalk could not read supported Codex persisted evidence",
    })

    yield* runOneShotSessionClient(
      Stream.make(unavailable),
      capture.output,
      { format: "json", lineSeparator: "\r\n" },
    )

    const rendered = (yield* Ref.get(capture.documents))[0] ?? ""
    expect(rendered.endsWith("\r\n")).toBe(true)
    expect(JSON.parse(rendered)).toEqual({
      _tag: "SessionUnavailable",
      protocolVersion: 4,
      code: "source-unavailable",
      message: "PackWalk could not read supported Codex persisted evidence",
    })
    expect(rendered).not.toContain('"views"')
  }),
)

it.effect("fails deterministically when the daemon stream ends without a public event", () =>
  Effect.gen(function* () {
    const capture = yield* captureOutput

    const failure = yield* runOneShotSessionClient(
      Stream.empty,
      capture.output,
      { format: "text", lineSeparator: "\n" },
    ).pipe(Effect.flip)

    expect(failure).toEqual(
      new OneShotSessionError({ reason: "empty-session-stream" }),
    )
    expect(yield* Ref.get(capture.documents)).toEqual([])
  }),
)

it.effect("queries the real public daemon IPC seam for both one-shot formats", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })
    const textCapture = yield* captureOutput
    const jsonCapture = yield* captureOutput

    yield* runOneShotSessionClient(
      packWalk.events,
      textCapture.output,
      { format: "text", lineSeparator: "\n" },
    )
    yield* runOneShotSessionClient(
      packWalk.events,
      jsonCapture.output,
      { format: "json", lineSeparator: "\n" },
    )

    const textDocument = (yield* Ref.get(textCapture.documents))[0] ?? ""
    const jsonDocument = (yield* Ref.get(jsonCapture.documents))[0] ?? ""
    expect(textDocument).toContain(sessionId)
    expect(textDocument).toContain("DISCOVERED")
    expect(textDocument).toContain("OBSERVED")
    expect(JSON.parse(jsonDocument)).toMatchObject({
      _tag: "SessionsSnapshot",
      protocolVersion: 4,
      views: [
        {
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          state: { _tag: "Discovered" },
          freshness: "fresh",
          provenance: { _tag: "Observed" },
          commitSequence: 1,
        },
      ],
    })
  }),
)

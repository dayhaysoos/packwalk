import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"

import { SessionHistory } from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const view = (commitSequence: number, observedAtMs: number) => ({
  protocolVersion: 2,
  sessionId,
  projectIdentity: "C:\\work\\fixture-project\u0007",
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: { _tag: commitSequence === 1 ? "Discovered" : "Polled" },
  freshness: "fresh",
  provenance: { _tag: "Observed" },
  sourceUpdatedAtMs: 1_000 + commitSequence,
  observedAtMs,
  commitSequence,
}) as const

const history = {
  _tag: "SessionHistory",
  protocolVersion: 4,
  sessionId,
  explainedView: view(2, 1_000),
  historyCoverage: "complete",
  omittedContent: [
    "prompts",
    "responses",
    "tool-output",
    "command-output",
    "diff-content",
    "terminal-input",
    "raw-codex-payloads",
    "raw-ipc-bodies",
  ],
  unsupportedFacts: ["live-observation", "attention"],
  facts: [
    {
      factVersion: 1,
      origin: { _tag: "Committed", recordedAtMs: 3_000 },
      view: view(1, 3_000),
    },
    {
      factVersion: 1,
      origin: { _tag: "Committed", recordedAtMs: 1_000 },
      view: view(2, 1_000),
    },
  ],
} as const

const decodeHistory = Schema.decodeUnknownEffect(SessionHistory, {
  onExcessProperty: "error",
})

it.effect("orders history by PackWalk commits even when wall clocks regress", () =>
  Effect.gen(function* () {
    const decoded = yield* decodeHistory(history)

    expect(decoded.facts.map((fact) => fact.view.commitSequence)).toEqual([1, 2])
    expect(decoded.facts.map((fact) => fact.view.observedAtMs)).toEqual([3_000, 1_000])

    const reversed = yield* decodeHistory({
      ...history,
      facts: [...history.facts].reverse(),
    }).pipe(Effect.result)
    expect(Result.isFailure(reversed)).toBe(true)
  }),
)

it.effect("rejects content and raw bodies at every nested history boundary", () =>
  Effect.gen(function* () {
    const forbiddenFields = [
      "prompt",
      "response",
      "toolOutput",
      "command_output",
      "stdout",
      "stderr",
      "diffContent",
      "patch",
      "terminal_input",
      "stdin",
      "rawCodexPayload",
      "raw_ipc_body",
      "payload",
      "frame",
      "transcript",
      "messages",
      "credentials",
      "environment",
    ] as const

    for (const field of forbiddenFields) {
      const invalidValues = [
        { ...history, [field]: "sensitive-marker" },
        {
          ...history,
          facts: [{ ...history.facts[0], [field]: "sensitive-marker" }, history.facts[1]],
        },
        {
          ...history,
          facts: [{
            ...history.facts[0],
            origin: { ...history.facts[0].origin, [field]: "sensitive-marker" },
          }, history.facts[1]],
        },
        {
          ...history,
          facts: [{
            ...history.facts[0],
            view: { ...history.facts[0].view, [field]: "sensitive-marker" },
          }, history.facts[1]],
        },
        {
          ...history,
          facts: [{
            ...history.facts[0],
            view: {
              ...history.facts[0].view,
              provenance: {
                ...history.facts[0].view.provenance,
                [field]: "sensitive-marker",
              },
            },
          }, history.facts[1]],
        },
      ]

      for (const invalid of invalidValues) {
        const result = yield* decodeHistory(invalid).pipe(Effect.result)
        expect(Result.isFailure(result), field).toBe(true)
      }
    }
  }),
)

it.effect("keeps migration coverage and recorded timestamps explicit", () =>
  Effect.gen(function* () {
    const baseline = {
      ...history,
      explainedView: view(2, 1_000),
      historyCoverage: "prior-history-unavailable",
      facts: [{
        factVersion: 1,
        origin: { _tag: "MigratedBaseline" },
        view: view(2, 1_000),
      }],
    } as const
    expect(Result.isSuccess(yield* decodeHistory(baseline).pipe(Effect.result))).toBe(true)

    for (const invalid of [
      { ...baseline, historyCoverage: "complete" },
      {
        ...history,
        facts: [{
          ...history.facts[0],
          origin: { _tag: "Committed", recordedAtMs: -1 },
        }, history.facts[1]],
      },
      {
        ...history,
        facts: [{
          ...history.facts[0],
          origin: { _tag: "Committed", recordedAtMs: 1.5 },
        }, history.facts[1]],
      },
    ]) {
      expect(Result.isFailure(yield* decodeHistory(invalid).pipe(Effect.result))).toBe(true)
    }
  }),
)

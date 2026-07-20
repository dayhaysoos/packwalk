import { expect, it } from "@effect/vitest"
import { Effect, Ref } from "effect"

import {
  ProjectIdentity,
  SessionEvidenceOrigin,
  SessionHistory,
  sessionHistoryOmittedContent,
  sessionHistoryUnsupportedFacts,
  SessionIdentity,
  SessionProvenance,
  SessionState,
  SessionView,
} from "../src/domain/session.js"
import {
  runSessionHistoryClient,
} from "../src/client/session-history-client.js"
import type { OneShotClientPort } from "../src/client/one-shot-session-client.js"

const sessionId = SessionIdentity.make("019f77d2-1a10-7cf0-b5df-76eebb4071ab")
const explainedView = SessionView.make({
  protocolVersion: 2,
  sessionId,
  projectIdentity: ProjectIdentity.make("C:\\work\\fixture-project\u0007"),
  activity: "persisted Codex activity",
  evidenceSource: "codex-sqlite-thread-index",
  state: SessionState.cases.Discovered.make({}),
  freshness: "fresh",
  provenance: SessionProvenance.cases.Observed.make({}),
  sourceUpdatedAtMs: 1_000,
  observedAtMs: 2_000,
  commitSequence: 1,
})
const history = SessionHistory.make({
  protocolVersion: 4,
  sessionId,
  explainedView,
  historyCoverage: "complete",
  omittedContent: sessionHistoryOmittedContent,
  unsupportedFacts: sessionHistoryUnsupportedFacts,
  facts: [{
    factVersion: 1,
    origin: SessionEvidenceOrigin.cases.Committed.make({ recordedAtMs: 2_000 }),
    view: explainedView,
  }],
})

const captureOutput = Effect.gen(function* () {
  const documents = yield* Ref.make<ReadonlyArray<string>>([])
  const output: OneShotClientPort = {
    writeDocument: (document) =>
      Ref.update(documents, (current) => [...current, document]),
  }
  return { documents, output }
})

it.effect("renders deterministic content-free text and JSON history documents", () =>
  Effect.gen(function* () {
    const text = yield* captureOutput
    const json = yield* captureOutput

    yield* runSessionHistoryClient(history, text.output, {
      format: "text",
      lineSeparator: "\r\n",
    })
    yield* runSessionHistoryClient(history, json.output, {
      format: "json",
      lineSeparator: "\n",
    })

    const textDocument = (yield* Ref.get(text.documents))[0] ?? ""
    expect(textDocument).toContain(`SESSION ${sessionId}`)
    expect(textDocument).toContain("COMMIT 1")
    expect(textDocument).toContain("RECORDED 1970-01-01T00:00:02.000Z")
    expect(textDocument).toContain("PROJECT C:\\\\work\\\\fixture-project\\u0007")
    expect(textDocument).toContain("OMITTED CONTENT prompts, responses")
    expect(textDocument).not.toMatch(/(?<!\r)\n/u)

    expect(JSON.parse((yield* Ref.get(json.documents))[0] ?? "")).toEqual(history)
  }),
)

it.effect("preserves injected Windows, macOS, and Linux project metadata", () =>
  Effect.gen(function* () {
    const cases = [
      {
        projectIdentity: "C:\\Work\\PackWalk",
        escapedProjectIdentity: "C:\\\\Work\\\\PackWalk",
        lineSeparator: "\r\n",
      },
      {
        projectIdentity: "/Users/example/Work/PackWalk-e\u0301",
        escapedProjectIdentity: "/Users/example/Work/PackWalk-e\u0301",
        lineSeparator: "\n",
      },
      {
        projectIdentity: "/home/example/work/PackWalk",
        escapedProjectIdentity: "/home/example/work/PackWalk",
        lineSeparator: "\n",
      },
    ] as const

    for (const testCase of cases) {
      const platformView = SessionView.make({
        ...explainedView,
        projectIdentity: ProjectIdentity.make(testCase.projectIdentity),
      })
      const platformHistory = SessionHistory.make({
        ...history,
        explainedView: platformView,
        facts: [{
          factVersion: 1,
          origin: SessionEvidenceOrigin.cases.Committed.make({
            recordedAtMs: 2_000,
          }),
          view: platformView,
        }],
      })
      const text = yield* captureOutput
      const json = yield* captureOutput

      yield* runSessionHistoryClient(platformHistory, text.output, {
        format: "text",
        lineSeparator: testCase.lineSeparator,
      })
      yield* runSessionHistoryClient(platformHistory, json.output, {
        format: "json",
        lineSeparator: testCase.lineSeparator,
      })

      const textDocument = (yield* Ref.get(text.documents))[0] ?? ""
      const jsonDocument = (yield* Ref.get(json.documents))[0] ?? ""
      expect(textDocument).toContain(
        `PROJECT ${testCase.escapedProjectIdentity}`,
      )
      expect(textDocument.endsWith(testCase.lineSeparator)).toBe(true)
      expect(JSON.parse(jsonDocument).explainedView.projectIdentity).toBe(
        testCase.projectIdentity,
      )
    }
  }),
)

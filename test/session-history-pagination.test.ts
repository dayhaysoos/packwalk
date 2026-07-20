import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"

import { makeDeterministicPackWalk } from "./support/deterministic-packwalk.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

it.effect("aggregates bounded pages without refreshing or widening the snapshot", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "C:\\work\\fixture-project",
      sourceUpdatedAtMs: 1_000,
    })

    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 2_000 })
    const beforePolling = yield* packWalk.inspectHistory(sessionId)
    expect(beforePolling._tag).toBe("SessionHistory")
    if (beforePolling._tag !== "SessionHistory") {
      return yield* Effect.die("Expected exact session history")
    }
    expect(beforePolling.facts).toHaveLength(1)

    for (let index = 0; index < 34; index += 1) {
      yield* packWalk.persistSourceUpdate({
        sourceUpdatedAtMs: 2_000 + index,
      })
      yield* TestClock.adjust("1 second")
    }

    const history = yield* packWalk.inspectHistory(sessionId)
    expect(history._tag).toBe("SessionHistory")
    if (history._tag !== "SessionHistory") {
      return yield* Effect.die("Expected paged exact session history")
    }

    expect(history.facts.length).toBeGreaterThan(32)
    expect(history.facts.map((fact) => fact.view.commitSequence)).toEqual(
      Array.from(
        { length: history.explainedView.commitSequence },
        (_, index) => index + 1,
      ),
    )
    expect(history.facts.at(-1)?.view).toEqual(history.explainedView)
    expect(history.explainedView.sourceUpdatedAtMs).toBe(2_033)
  }),
)

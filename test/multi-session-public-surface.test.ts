import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"

import { formatSessionEvent } from "../src/client/session-client.js"
import { makeCodexIndexedPackWalk } from "./support/codex-indexed-packwalk.js"
import { makeDeterministicPackWalk } from "./support/deterministic-packwalk.js"

const firstSessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"
const secondSessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ac"

it.effect("keeps two overlapping same-repository sessions distinct through IPC and CLI", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const forbidden = "must-not-cross-the-public-session-surface"
    const packWalk = yield* makeCodexIndexedPackWalk([
      {
        sessionId: firstSessionId,
        projectIdentity: "/work/shared/repo",
        sourceUpdatedAtMs: 1_000,
        forbiddenContent: `${forbidden}-first`,
      },
      {
        sessionId: secondSessionId,
        projectIdentity: "/work/shared/repo",
        sourceUpdatedAtMs: 1_250,
        forbiddenContent: `${forbidden}-second`,
      },
    ])
    const initialObserved = yield* Deferred.make<void>()
    const baselineObserved = yield* Deferred.make<void>()
    const observedCount = yield* Ref.make(0)
    const collected = yield* packWalk.events.pipe(
      Stream.tap(() =>
        Ref.updateAndGet(observedCount, (count) => count + 1).pipe(
          Effect.flatMap((count) =>
            count === 1
              ? Deferred.succeed(initialObserved, undefined)
              : count === 2
                ? Deferred.succeed(baselineObserved, undefined)
                : Effect.void,
          ),
        ),
      ),
      Stream.take(3),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(initialObserved)
    yield* TestClock.adjust("1 second")
    yield* Deferred.await(baselineObserved)
    yield* packWalk.persistCodexActivity(firstSessionId, 2_500)
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))
    expect(events.map((event) => event._tag)).toEqual([
      "SessionsSnapshot",
      "SessionsUpdated",
      "SessionsUpdated",
    ])

    const initial = events[0]
    const baseline = events[1]
    const updated = events[2]
    if (
      initial?._tag !== "SessionsSnapshot" ||
      baseline?._tag !== "SessionsUpdated" ||
      updated?._tag !== "SessionsUpdated"
    ) {
      return yield* Effect.die("Expected complete multi-session overview events")
    }

    const byId = <A extends { readonly sessionId: string }>(
      views: ReadonlyArray<A>,
    ): ReadonlyMap<string, A> =>
      new Map(views.map((view) => [view.sessionId, view]))
    expect(new Set(initial.views.map((view) => view.sessionId))).toEqual(
      new Set([firstSessionId, secondSessionId]),
    )

    const baselineById = byId(baseline.views)
    const updatedById = byId(updated.views)
    expect(updatedById.get(firstSessionId)).toMatchObject({
      sourceUpdatedAtMs: 2_500,
      state: { _tag: "Polled" },
    })
    expect(updatedById.get(firstSessionId)?.commitSequence).toBeGreaterThan(
      baselineById.get(firstSessionId)?.commitSequence ?? 0,
    )
    expect(updatedById.get(secondSessionId)).toEqual(
      baselineById.get(secondSessionId),
    )
    expect(updated.changedSessionIds).toEqual([firstSessionId])

    const frame = formatSessionEvent(initial)
    const firstIdentityLine = frame.findIndex((line) =>
      line.includes(firstSessionId),
    )
    const secondIdentityLine = frame.findIndex((line) =>
      line.includes(secondSessionId),
    )
    expect(firstIdentityLine).toBeGreaterThanOrEqual(0)
    expect(secondIdentityLine).toBeGreaterThanOrEqual(0)
    expect(firstIdentityLine).not.toBe(secondIdentityLine)
    expect(frame.filter((line) => line.includes("repo"))).toHaveLength(2)
    expect(JSON.stringify(events)).not.toContain(forbidden)
    expect(frame.join("\n")).not.toContain(forbidden)
  }),
)

it.effect("publishes a redacted unavailable result for duplicate exact source identity", () =>
  Effect.gen(function* () {
    const forbidden = "conflicting-source-detail"
    const packWalk = yield* makeDeterministicPackWalk([
      {
        version: 1,
        sessionId: firstSessionId,
        projectIdentity: `/first/${forbidden}`,
        sourceUpdatedAtMs: 1_000,
      },
      {
        version: 1,
        sessionId: firstSessionId,
        projectIdentity: `/second/${forbidden}`,
        sourceUpdatedAtMs: 2_000,
      },
    ])

    const events = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(events).toEqual([
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "source-ambiguous",
        message: "PackWalk found ambiguous Codex persisted evidence",
      },
    ])
    const event = events[0]
    if (event === undefined) return yield* Effect.die("Expected unavailable event")
    expect(formatSessionEvent(event).join("\n")).toContain("UNAVAILABLE")
    expect(JSON.stringify(events)).not.toContain(forbidden)
  }),
)

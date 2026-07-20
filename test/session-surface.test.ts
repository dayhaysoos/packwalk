import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"

import { makeDeterministicPackWalk } from "./support/deterministic-packwalk.js"
import { makeDeterministicSessionSurface } from "./support/deterministic-session-surface.js"
import {
  CodexPersistedFact,
  ProjectIdentity,
  SessionIdentity,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const makeMaximumEscapedFacts = (
  length: number,
): ReadonlyArray<CodexPersistedFact> => {
  const identityPrefix = "\0".repeat(4_090)
  const projectIdentity = ProjectIdentity.make("\0".repeat(4_096))

  return Array.from({ length }, (_, index) =>
    CodexPersistedFact.make({
      version: 1,
      sessionId: SessionIdentity.make(
        `${identityPrefix}${String(index).padStart(6, "0")}`,
      ),
      projectIdentity,
      sourceUpdatedAtMs: 1_000,
    }),
  )
}

const eventAvailability = (
  event: { readonly _tag: string; readonly code?: string },
) => ({
  _tag: event._tag,
  code: event.code,
})

it.effect("publishes one committed discovered snapshot and one committed polling update", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)

    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })

    const firstObserved = yield* Deferred.make<void>()
    const collected = yield* packWalk.events.pipe(
      Stream.tap(() => Deferred.succeed(firstObserved, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(firstObserved)
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 2_500 })
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))

    expect(events).toEqual([
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [{
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
        }],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 2,
        views: [{
          protocolVersion: 1,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Polled" },
          freshness: "fresh",
          sourceUpdatedAtMs: 2_500,
          observedAtMs: 3_000,
          commitSequence: 2,
        }],
        changedSessionIds: [sessionId],
      },
    ])

    const reconnect = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(reconnect[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [{ commitSequence: 2, state: { _tag: "Polled" } }],
    })
  }),
)

it.effect("adds a discovered identity without replacing a restored exact session", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const replacementSessionId =
      "019f77d2-1a10-7cf0-b5df-76eebb4071ac"
    const surface = yield* makeDeterministicSessionSurface(
      CodexPersistedFact.make({
        version: 1,
        sessionId: SessionIdentity.make(replacementSessionId),
        projectIdentity: ProjectIdentity.make("replacement-project"),
        sourceUpdatedAtMs: 1_500,
      }),
      {
        restored: SessionView.make({
          protocolVersion: 1,
          sessionId: SessionIdentity.make(sessionId),
          projectIdentity: ProjectIdentity.make("restored-project"),
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: SessionState.cases.Polled.make({}),
          freshness: "fresh",
          sourceUpdatedAtMs: 9_000,
          observedAtMs: 1_000,
          commitSequence: 7,
        }),
      },
    )

    const events = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(events[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [
        {
          sessionId,
          projectIdentity: "restored-project",
          state: { _tag: "Polled" },
          sourceUpdatedAtMs: 9_000,
          commitSequence: 7,
        },
        {
          sessionId: replacementSessionId,
          projectIdentity: "replacement-project",
          state: { _tag: "Discovered" },
          sourceUpdatedAtMs: 1_500,
          observedAtMs: 2_000,
          commitSequence: 8,
        },
      ],
    })
  }),
)

it.effect("rejects crossed exact polling results before publishing a session update", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const firstSessionId =
      "019f77d2-1a10-7cf0-b5df-76eebb4071ac"
    const secondSessionId =
      "019f77d2-1a10-7cf0-b5df-76eebb4071ad"
    const surface = yield* makeDeterministicSessionSurface(
      [
        CodexPersistedFact.make({
          version: 1,
          sessionId: SessionIdentity.make(firstSessionId),
          projectIdentity: ProjectIdentity.make("shared-project"),
          sourceUpdatedAtMs: 1_000,
        }),
        CodexPersistedFact.make({
          version: 1,
          sessionId: SessionIdentity.make(secondSessionId),
          projectIdentity: ProjectIdentity.make("shared-project"),
          sourceUpdatedAtMs: 1_500,
        }),
      ],
      { crossPollResults: true },
    )
    const initialObserved = yield* Deferred.make<void>()
    const published = yield* surface.events.pipe(
      Stream.tap((event) =>
        event._tag === "SessionsSnapshot"
          ? Deferred.succeed(initialObserved, undefined)
          : Effect.void,
      ),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(initialObserved)
    yield* TestClock.adjust("1 second")

    expect(Array.from(yield* Fiber.join(published))).toEqual([
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [
          {
            protocolVersion: 1,
            sessionId: firstSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Discovered" },
            freshness: "fresh",
            sourceUpdatedAtMs: 1_000,
            observedAtMs: 2_000,
            commitSequence: 1,
          },
          {
            protocolVersion: 1,
            sessionId: secondSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Discovered" },
            freshness: "fresh",
            sourceUpdatedAtMs: 1_500,
            observedAtMs: 2_000,
            commitSequence: 2,
          },
        ],
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "source-incompatible",
        message: "PackWalk could not read supported Codex persisted evidence",
      },
    ])

    yield* surface.refresh()
    const current = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(current).toEqual([
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [
          {
            protocolVersion: 1,
            sessionId: firstSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Discovered" },
            freshness: "fresh",
            sourceUpdatedAtMs: 1_000,
            observedAtMs: 2_000,
            commitSequence: 1,
          },
          {
            protocolVersion: 1,
            sessionId: secondSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Discovered" },
            freshness: "fresh",
            sourceUpdatedAtMs: 1_500,
            observedAtMs: 2_000,
            commitSequence: 2,
          },
        ],
      },
    ])
  }),
)

it.effect("rejects an unpublishable startup overview before committing it", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const publishableFacts = makeMaximumEscapedFacts(84)
    const surface = yield* makeDeterministicSessionSurface(
      makeMaximumEscapedFacts(85),
    )

    const unavailable = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )[0]
    expect(unavailable === undefined ? undefined : eventAvailability(unavailable))
      .toEqual({
        _tag: "SessionUnavailable",
        code: "overview-unavailable",
      })
    expect(yield* surface.storedSnapshot()).toMatchObject({
      views: [],
      lastCommitSequence: 0,
    })

    yield* surface.replaceSourceFactsForTest(publishableFacts)
    yield* surface.refresh()

    const recovered = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )[0]
    expect(recovered?._tag).toBe("SessionsSnapshot")
    if (recovered?._tag !== "SessionsSnapshot") return
    expect(recovered.views).toHaveLength(84)
    expect(recovered.views.at(-1)?.commitSequence).toBe(84)
    expect(yield* surface.storedSnapshot()).toMatchObject({
      lastCommitSequence: 84,
    })
  }),
)

it.effect("rejects an unpublishable overview update before advancing stored state", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const publishableFacts = makeMaximumEscapedFacts(84)
    const oversizedFacts = makeMaximumEscapedFacts(85)
    const surface = yield* makeDeterministicSessionSurface(publishableFacts)
    const initialObserved = yield* Deferred.make<void>()
    const collected = yield* surface.events.pipe(
      Stream.tap(() => Deferred.succeed(initialObserved, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(initialObserved)
    yield* surface.replaceSourceFactsForTest(oversizedFacts)
    yield* surface.refresh()

    const events = Array.from(yield* Fiber.join(collected))
    expect(events[0]?._tag).toBe("SessionsSnapshot")
    expect(events[0]?._tag === "SessionsSnapshot" ? events[0].views.length : 0)
      .toBe(84)
    expect(events[1] === undefined ? undefined : eventAvailability(events[1]))
      .toEqual({
        _tag: "SessionUnavailable",
        code: "overview-unavailable",
      })

    const unchanged = yield* surface.storedSnapshot()
    expect(unchanged.views).toHaveLength(84)
    expect(unchanged.lastCommitSequence).toBe(84)
    expect(unchanged.views.some((view) =>
      view.sessionId === oversizedFacts[84]?.sessionId
    )).toBe(false)

    yield* surface.replaceSourceFactsForTest(publishableFacts)
    yield* surface.refresh()
    const recovered = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )[0]
    expect(recovered?._tag).toBe("SessionsSnapshot")
    if (recovered?._tag !== "SessionsSnapshot") return
    expect(recovered.views).toHaveLength(84)
    expect(recovered.views.at(-1)?.commitSequence).toBe(84)
  }),
)

it.effect("publishes the first successful reread once before later persisted activity", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)

    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })
    const initialObserved = yield* Deferred.make<void>()
    const rereadObserved = yield* Deferred.make<void>()
    const collected = yield* packWalk.events.pipe(
      Stream.tap((event) =>
        event._tag === "SessionsSnapshot"
          ? Deferred.succeed(initialObserved, undefined)
          : Deferred.succeed(rereadObserved, undefined),
      ),
      Stream.take(3),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(initialObserved)
    yield* TestClock.adjust("1 second")
    yield* Deferred.await(rereadObserved)

    yield* TestClock.adjust("1 second")
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 2_500 })
    yield* TestClock.adjust("1 second")

    expect(Array.from(yield* Fiber.join(collected))).toEqual([
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 2,
        views: [{
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
        }],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 2,
        views: [{
          protocolVersion: 1,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Polled" },
          freshness: "fresh",
          sourceUpdatedAtMs: 1_000,
          observedAtMs: 3_000,
          commitSequence: 2,
        }],
        changedSessionIds: [sessionId],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 2,
        views: [{
          protocolVersion: 1,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Polled" },
          freshness: "fresh",
          sourceUpdatedAtMs: 2_500,
          observedAtMs: 5_000,
          commitSequence: 3,
        }],
        changedSessionIds: [sessionId],
      },
    ])
  }),
)

it.effect("resumes a slow subscriber at the latest committed session view", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)

    const surface = yield* makeDeterministicSessionSurface(
      CodexPersistedFact.make({
        version: 1,
        sessionId: SessionIdentity.make(sessionId),
        projectIdentity: ProjectIdentity.make("fixture-project"),
        sourceUpdatedAtMs: 1_000,
      }),
    )
    const initialObserved = yield* Deferred.make<void>()
    const releaseSubscriber = yield* Deferred.make<void>()
    const collected = yield* surface.events.pipe(
      Stream.tap((event) =>
        event._tag === "SessionsSnapshot"
          ? Deferred.succeed(initialObserved, undefined).pipe(
              Effect.andThen(Deferred.await(releaseSubscriber)),
            )
          : Effect.void,
      ),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(initialObserved)
    yield* TestClock.adjust("1 second")
    yield* surface.persistSourceUpdate(2_500)
    yield* TestClock.adjust("1 second")
    yield* surface.persistSourceUpdate(3_500)
    yield* TestClock.adjust("1 second")
    yield* Deferred.succeed(releaseSubscriber, undefined)

    const events = Array.from(yield* Fiber.join(collected))
    expect(events[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [{ commitSequence: 1, state: { _tag: "Discovered" } }],
    })
    expect(events[1]).toMatchObject({
      _tag: "SessionsUpdated",
      views: [{
        commitSequence: 4,
        sourceUpdatedAtMs: 3_500,
        observedAtMs: 5_000,
        state: { _tag: "Polled" },
      }],
    })
  }),
)

it.effect("rejects incompatible or content-bearing evidence with a redacted public error", () =>
  Effect.gen(function* () {
    const forbidden = "do-not-echo-this-prompt"
    const invalidInputs = [
      {
        version: 2,
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
      },
      {
        version: 1,
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
        prompt: forbidden,
      },
      {
        version: 1,
        sessionId: 42,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
      },
    ]

    for (const input of invalidInputs) {
      const packWalk = yield* makeDeterministicPackWalk(input)
      const events = Array.from(
        yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
      )

      expect(events).toEqual([
        {
          _tag: "SessionUnavailable",
          protocolVersion: 2,
          code: "source-incompatible",
          message: "PackWalk could not read supported Codex persisted evidence",
        },
      ])
      expect(JSON.stringify(events)).not.toContain(forbidden)
    }
  }),
)

it.effect("recovers startup discovery when a later CLI subscribes after evidence appears", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeDeterministicPackWalk({
      version: 2,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })

    const unavailable = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(unavailable[0]).toMatchObject({
      _tag: "SessionUnavailable",
      code: "source-incompatible",
    })

    yield* packWalk.persistSourceFactForTest({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 2_500,
    })

    const recovered = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(recovered[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [{
        sessionId,
        projectIdentity: "fixture-project",
        state: { _tag: "Discovered" },
        sourceUpdatedAtMs: 2_500,
        observedAtMs: 2_000,
        commitSequence: 1,
      }],
    })
  }),
)

it.effect("does not publish a session update when its authoritative commit fails", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)

    const packWalk = yield* makeDeterministicPackWalk(
      {
        version: 1,
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
      },
      { failCommitSequence: 2 },
    )

    const firstObserved = yield* Deferred.make<void>()
    const collected = yield* packWalk.events.pipe(
      Stream.tap(() => Deferred.succeed(firstObserved, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(firstObserved)
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 2_500 })
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))

    expect(events[0]?._tag).toBe("SessionsSnapshot")
    expect(events[1]).toEqual({
      _tag: "SessionUnavailable",
      protocolVersion: 2,
      code: "storage-unavailable",
      message: "PackWalk could not commit its current session view",
    })
    expect(events.some((event) => event._tag === "SessionsUpdated")).toBe(false)
  }),
)

it.effect("recovers a source-lost poll on reconnect and resumes exact-identity polling", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)

    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })
    const firstObserved = yield* Deferred.make<void>()
    const collected = yield* packWalk.events.pipe(
      Stream.tap(() => Deferred.succeed(firstObserved, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(firstObserved)
    yield* packWalk.loseSourceForTest
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))
    expect(events[0]?._tag).toBe("SessionsSnapshot")
    expect(events[1]).toEqual({
      _tag: "SessionUnavailable",
      protocolVersion: 2,
      code: "source-unavailable",
      message: "PackWalk could not read supported Codex persisted evidence",
    })

    yield* packWalk.restoreSourceForTest
    const recoveredObserved = yield* Deferred.make<void>()
    const recovered = yield* packWalk.events.pipe(
      Stream.tap((event) =>
        event._tag === "SessionsSnapshot"
          ? Deferred.succeed(recoveredObserved, undefined)
          : Effect.void,
      ),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(recoveredObserved)
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 2_500 })
    yield* TestClock.adjust("1 second")

    const recoveredEvents = Array.from(yield* Fiber.join(recovered))
    expect(recoveredEvents[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [{
        sessionId,
        projectIdentity: "fixture-project",
        state: { _tag: "Discovered" },
        sourceUpdatedAtMs: 1_000,
        commitSequence: 1,
      }],
    })
    expect(recoveredEvents[1]).toMatchObject({
      _tag: "SessionsUpdated",
      views: [{
        sessionId,
        projectIdentity: "fixture-project",
        state: { _tag: "Polled" },
        sourceUpdatedAtMs: 2_500,
        observedAtMs: 4_000,
        commitSequence: 2,
      }],
    })
  }),
)

it.effect("surfaces an unrecoverable polling worker failure to the daemon owner", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)

    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })
    const first = yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect)
    expect(Array.from(first)[0]?._tag).toBe("SessionsSnapshot")

    const runtimeFailure = yield* packWalk.lifetime.pipe(
      Effect.flip,
      Effect.forkChild,
    )
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 500 })
    yield* TestClock.adjust("1 second")

    expect(yield* Fiber.join(runtimeFailure)).toMatchObject({
      _tag: "PackWalk.IllegalSessionTransition",
      reason: "source-time-regressed",
    })
  }),
)

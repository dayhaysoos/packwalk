import { expect, it } from "@effect/vitest"
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Ref,
  Result,
  Scope,
  Stream,
} from "effect"
import { TestClock } from "effect/testing"

import {
  makeDeterministicPackWalk,
  makeRestartableDeterministicPackWalk,
} from "./support/deterministic-packwalk.js"
import { makeDeterministicSessionSurface } from "./support/deterministic-session-surface.js"
import {
  runSessionClient,
  type ClientPort,
} from "../src/client/session-client.js"
import {
  CodexPersistedFact,
  encodeSessionProtocolEvent,
  MaximumSessionEventBytes,
  ProjectIdentity,
  SessionEvent,
  SessionIdentity,
  SessionProvenance,
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
        protocolVersion: 3,
        views: [{
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
        }],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
        views: [{
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Polled" },
          freshness: "fresh",
          provenance: { _tag: "Observed" },
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
          protocolVersion: 2,
          sessionId: SessionIdentity.make(sessionId),
          projectIdentity: ProjectIdentity.make("restored-project"),
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: SessionState.cases.Polled.make({}),
          freshness: "fresh",
          provenance: SessionProvenance.cases.Observed.make({}),
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

it.effect("retains crossed exact polling results as unsupported without merging them", () =>
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
        protocolVersion: 3,
        views: [
          {
            protocolVersion: 2,
            sessionId: firstSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Discovered" },
            freshness: "fresh",
            provenance: { _tag: "Observed" },
            sourceUpdatedAtMs: 1_000,
            observedAtMs: 2_000,
            commitSequence: 1,
          },
          {
            protocolVersion: 2,
            sessionId: secondSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Discovered" },
            freshness: "fresh",
            provenance: { _tag: "Observed" },
            sourceUpdatedAtMs: 1_500,
            observedAtMs: 2_000,
            commitSequence: 2,
          },
        ],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
        views: [
          expect.objectContaining({
            sessionId: firstSessionId,
            freshness: "stale",
            provenance: {
              _tag: "Retained",
              reason: "source-unsupported",
            },
            sourceUpdatedAtMs: 1_000,
            observedAtMs: 2_000,
            commitSequence: 3,
          }),
          expect.objectContaining({
            sessionId: secondSessionId,
            freshness: "stale",
            provenance: {
              _tag: "Retained",
              reason: "source-unsupported",
            },
            sourceUpdatedAtMs: 1_500,
            observedAtMs: 2_000,
            commitSequence: 4,
          }),
        ],
        changedSessionIds: [firstSessionId, secondSessionId],
      },
    ])

    yield* surface.refresh()
    const current = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(current).toEqual([
      {
        _tag: "SessionsSnapshot",
        protocolVersion: 3,
        views: [
          {
            protocolVersion: 2,
            sessionId: firstSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Polled" },
            freshness: "fresh",
            provenance: { _tag: "Observed" },
            sourceUpdatedAtMs: 1_000,
            observedAtMs: 3_000,
            commitSequence: 5,
          },
          {
            protocolVersion: 2,
            sessionId: secondSessionId,
            projectIdentity: "shared-project",
            activity: "persisted Codex activity",
            evidenceSource: "codex-sqlite-thread-index",
            state: { _tag: "Polled" },
            freshness: "fresh",
            provenance: { _tag: "Observed" },
            sourceUpdatedAtMs: 1_500,
            observedAtMs: 3_000,
            commitSequence: 6,
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

it.effect("falls back to a bounded complete snapshot when changed identities make the polling update too large", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const facts = makeMaximumEscapedFacts(84)
    const expectedPolledViews = facts.map((fact, index) =>
      SessionView.make({
        protocolVersion: 2,
        sessionId: fact.sessionId,
        projectIdentity: fact.projectIdentity,
        activity: "persisted Codex activity",
        evidenceSource: "codex-sqlite-thread-index",
        state: SessionState.cases.Polled.make({}),
        freshness: "fresh",
        provenance: SessionProvenance.cases.Observed.make({}),
        sourceUpdatedAtMs: fact.sourceUpdatedAtMs,
        observedAtMs: 3_000,
        commitSequence: 85 + index,
      }),
    )
    const firstExpectedPolledView = expectedPolledViews[0]
    if (firstExpectedPolledView === undefined) {
      return yield* Effect.die("missing expected polled view")
    }
    const expectedOverviewViews = [
      firstExpectedPolledView,
      ...expectedPolledViews.slice(1),
    ] as const
    const expectedSnapshot = SessionEvent.cases.SessionsSnapshot.make({
      protocolVersion: 3,
      views: expectedOverviewViews,
    })
    const oversizedUpdate = SessionEvent.cases.SessionsUpdated.make({
      protocolVersion: 3,
      views: expectedOverviewViews,
      changedSessionIds: facts.map((fact) => fact.sessionId),
    })
    const encodedSnapshot = yield* encodeSessionProtocolEvent(expectedSnapshot)
    const updateEncoding = yield* encodeSessionProtocolEvent(
      oversizedUpdate,
    ).pipe(Effect.result)

    expect(new TextEncoder().encode(encodedSnapshot).byteLength)
      .toBeLessThanOrEqual(MaximumSessionEventBytes)
    expect(Result.isFailure(updateEncoding)).toBe(true)

    const surface = yield* makeDeterministicSessionSurface(facts)
    const initialObserved = yield* Deferred.make<void>()
    const collected = yield* surface.events.pipe(
      Stream.tap(() => Deferred.succeed(initialObserved, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(initialObserved)
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))
    expect(events[0]?._tag).toBe("SessionsSnapshot")
    expect(events[1]?._tag).toBe("SessionsSnapshot")
    const polled = events[1]
    if (polled?._tag !== "SessionsSnapshot") return
    expect(polled.views).toHaveLength(84)
    expect(polled.views.every((view, index) =>
      view.sessionId === facts[index]?.sessionId
    )).toBe(true)
    expect(polled.views.every((view) => view.state._tag === "Polled")).toBe(true)
    expect(polled.views.map((view) => view.commitSequence)).toEqual(
      Array.from({ length: 84 }, (_, index) => 85 + index),
    )

    const committed = yield* surface.storedSnapshot()
    expect(committed.views).toHaveLength(84)
    expect(committed.lastCommitSequence).toBe(168)
    expect(committed.views.every((view) => view.state._tag === "Polled"))
      .toBe(true)

    yield* TestClock.adjust("1 second")
    const afterSecondPoll = yield* surface.storedSnapshot()
    expect(afterSecondPoll.lastCommitSequence).toBe(168)
    expect(afterSecondPoll.views.map((view) => view.commitSequence)).toEqual(
      committed.views.map((view) => view.commitSequence),
    )

    const reconnect = Array.from(
      yield* surface.events.pipe(Stream.take(1), Stream.runCollect),
    )[0]
    expect(reconnect?._tag).toBe("SessionsSnapshot")
    if (reconnect?._tag !== "SessionsSnapshot") return
    expect(reconnect.views).toHaveLength(84)
    expect(reconnect.views.every((view) => view.state._tag === "Polled"))
      .toBe(true)
    expect(reconnect.views.at(-1)?.commitSequence).toBe(168)
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
        protocolVersion: 3,
        views: [{
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
        }],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
        views: [{
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Polled" },
          freshness: "fresh",
          provenance: { _tag: "Observed" },
          sourceUpdatedAtMs: 1_000,
          observedAtMs: 3_000,
          commitSequence: 2,
        }],
        changedSessionIds: [sessionId],
      },
      {
        _tag: "SessionsUpdated",
        protocolVersion: 3,
        views: [{
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          activity: "persisted Codex activity",
          evidenceSource: "codex-sqlite-thread-index",
          state: { _tag: "Polled" },
          freshness: "fresh",
          provenance: { _tag: "Observed" },
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
          protocolVersion: 3,
          code: "source-incompatible",
          message: "PackWalk could not read supported Codex persisted evidence",
        },
      ])
      expect(JSON.stringify(events)).not.toContain(forbidden)
    }
  }),
)

it.effect("surfaces unsupported discovery without dropping the committed overview", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })

    const initial = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(initial[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [{ sessionId, commitSequence: 1 }],
    })

    yield* packWalk.rejectDiscoveryForTest
    const rejected = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(rejected).toEqual([{
      _tag: "SessionsSnapshot",
      protocolVersion: 3,
      views: [{
        protocolVersion: 2,
        sessionId,
        projectIdentity: "fixture-project",
        activity: "persisted Codex activity",
        evidenceSource: "codex-sqlite-thread-index",
        state: { _tag: "Discovered" },
        freshness: "stale",
        provenance: {
          _tag: "Retained",
          reason: "source-unsupported",
        },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 2_000,
        commitSequence: 2,
      }],
    }])

    yield* packWalk.acceptDiscoveryForTest
    const recovered = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(recovered[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      views: [{
        sessionId,
        state: { _tag: "Polled" },
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        observedAtMs: 2_000,
        commitSequence: 3,
      }],
    })

    const repeated = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(repeated).toEqual(recovered)
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
      protocolVersion: 3,
      code: "storage-unavailable",
      message: "PackWalk could not commit its current session view",
    })
    expect(events.some((event) => event._tag === "SessionsUpdated")).toBe(false)
  }),
)

it.effect("restores, degrades, recovers, and reconnects without invented replay", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const renderedFrames = yield* Ref.make<
      ReadonlyArray<ReadonlyArray<string>>
    >([])
    const client: ClientPort = {
      writeFrame: (lines) =>
        Ref.update(renderedFrames, (frames) => [...frames, lines]),
    }

    const packWalk = yield* makeRestartableDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })
    const firstScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(firstScope, Exit.void))
    yield* packWalk.startDaemonIn(firstScope)
    const firstObserved = yield* Deferred.make<void>()
    const firstRunEvents = yield* Ref.make<ReadonlyArray<SessionEvent>>([])
    const firstRun = yield* runSessionClient(
      packWalk.events.pipe(
        Stream.tap((event) =>
          Ref.update(firstRunEvents, (events) => [...events, event]),
        ),
        Stream.tap(() => Deferred.succeed(firstObserved, undefined)),
        Stream.take(2),
      ),
      client,
    ).pipe(
      Effect.forkChild,
    )

    yield* Deferred.await(firstObserved)
    yield* TestClock.adjust("1 second")
    yield* Fiber.join(firstRun)
    const firstEvents = yield* Ref.get(firstRunEvents)
    expect(firstEvents[1]).toMatchObject({
      _tag: "SessionsUpdated",
      views: [{
        sessionId,
        state: { _tag: "Polled" },
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 3_000,
        commitSequence: 2,
      }],
    })
    yield* Scope.close(firstScope, Exit.void)

    const secondScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(secondScope, Exit.void))
    yield* packWalk.startDaemonIn(secondScope)
    const restoredObserved = yield* Deferred.make<void>()
    const secondRunEvents = yield* Ref.make<ReadonlyArray<SessionEvent>>([])
    const collected = yield* runSessionClient(
      packWalk.events.pipe(
        Stream.tap((event) =>
          Ref.update(secondRunEvents, (events) => [...events, event]),
        ),
        Stream.tap(() => Deferred.succeed(restoredObserved, undefined)),
        Stream.take(3),
      ),
      client,
    ).pipe(
      Effect.forkChild,
    )
    yield* Deferred.await(restoredObserved)

    yield* packWalk.loseExactSourceForTest(sessionId)
    yield* TestClock.adjust("1 second")
    yield* TestClock.adjust("1 second")
    yield* packWalk.restoreExactSourceForTest(sessionId)
    yield* TestClock.adjust("1 second")
    yield* TestClock.adjust("1 second")

    yield* Fiber.join(collected)
    const events = yield* Ref.get(secondRunEvents)
    expect(events[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      protocolVersion: 3,
      views: [{
        protocolVersion: 2,
        sessionId,
        projectIdentity: "fixture-project",
        state: { _tag: "Polled" },
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 3_000,
        commitSequence: 2,
      }],
    })
    expect(events[1]).toEqual({
      _tag: "SessionsUpdated",
      protocolVersion: 3,
      views: [{
        protocolVersion: 2,
        sessionId,
        projectIdentity: "fixture-project",
        activity: "persisted Codex activity",
        evidenceSource: "codex-sqlite-thread-index",
        state: { _tag: "Polled" },
        freshness: "stale",
        provenance: {
          _tag: "Retained",
          reason: "source-unavailable",
        },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 3_000,
        commitSequence: 3,
      }],
      changedSessionIds: [sessionId],
    })
    expect(events[2]).toMatchObject({
      _tag: "SessionsUpdated",
      protocolVersion: 3,
      views: [{
        protocolVersion: 2,
        sessionId,
        state: { _tag: "Polled" },
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        sourceUpdatedAtMs: 1_000,
        commitSequence: 4,
        observedAtMs: 6_000,
      }],
      changedSessionIds: [sessionId],
    })
    const recovered = events[2]
    if (recovered?._tag !== "SessionsUpdated") {
      return yield* Effect.die("Expected one committed recovery update")
    }

    const reconnectEvents = yield* Ref.make<ReadonlyArray<SessionEvent>>([])
    yield* runSessionClient(
      packWalk.events.pipe(
        Stream.tap((event) =>
          Ref.update(reconnectEvents, (events) => [...events, event]),
        ),
        Stream.take(1),
      ),
      client,
    )
    const reconnect = yield* Ref.get(reconnectEvents)
    expect(reconnect).toEqual([
      SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 3,
        views: recovered.views,
      }),
    ])
    expect(reconnect[0]).toMatchObject({
      views: [{ commitSequence: 4, observedAtMs: 6_000 }],
    })
    const frames = yield* Ref.get(renderedFrames)
    expect(frames).toHaveLength(6)
    expect(frames[2]).toEqual(frames[1])
    expect(frames[3]?.join("\n")).toContain(
      "RETAINED (source-unavailable)",
    )
    expect(frames[3]?.join("\n")).toContain("stale")
    expect(frames[4]?.join("\n")).toContain("OBSERVED")
    expect(frames[4]?.join("\n")).toContain("fresh")
    expect(frames[5]).toEqual(frames[4])
    yield* Scope.close(secondScope, Exit.void)
  }),
)

it.effect("degrades only the exact unavailable session in a complete overview", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const secondSessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ac"
    const packWalk = yield* makeDeterministicPackWalk([
      {
        version: 1,
        sessionId,
        projectIdentity: "shared-project",
        sourceUpdatedAtMs: 1_000,
      },
      {
        version: 1,
        sessionId: secondSessionId,
        projectIdentity: "shared-project",
        sourceUpdatedAtMs: 1_500,
      },
    ])
    const initialObserved = yield* Deferred.make<void>()
    const baselineObserved = yield* Deferred.make<void>()
    const seen = yield* Ref.make(0)
    const collected = yield* packWalk.events.pipe(
      Stream.tap(() =>
        Ref.updateAndGet(seen, (count) => count + 1).pipe(
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
    yield* packWalk.loseExactSourceForTest(sessionId)
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))
    const baseline = events[1]
    const degraded = events[2]
    if (
      baseline?._tag !== "SessionsUpdated" ||
      degraded?._tag !== "SessionsUpdated"
    ) {
      return yield* Effect.die("Expected complete committed overview updates")
    }
    const baselineById = new Map(
      baseline.views.map((view) => [view.sessionId, view]),
    )
    const degradedById = new Map(
      degraded.views.map((view) => [view.sessionId, view]),
    )
    const firstExactSessionId = SessionIdentity.make(sessionId)
    const secondExactSessionId = SessionIdentity.make(secondSessionId)

    expect(degraded.changedSessionIds).toEqual([sessionId])
    expect(degradedById.get(firstExactSessionId)).toMatchObject({
      freshness: "stale",
      provenance: {
        _tag: "Retained",
        reason: "source-unavailable",
      },
      sourceUpdatedAtMs: 1_000,
      observedAtMs: 3_000,
      commitSequence: 5,
    })
    expect(degradedById.get(secondExactSessionId)).toEqual(
      baselineById.get(secondExactSessionId),
    )
  }),
)

it.effect("retains unsupported regressed evidence without overwriting the last supported fact", () =>
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
      Stream.take(3),
      Stream.runCollect,
      Effect.forkChild,
    )
    yield* Deferred.await(firstObserved)
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 500 })
    yield* TestClock.adjust("1 second")
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 1_000 })
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))
    expect(events[1]).toMatchObject({
      _tag: "SessionsUpdated",
      protocolVersion: 3,
      views: [{
        sessionId,
        freshness: "stale",
        provenance: {
          _tag: "Retained",
          reason: "source-unsupported",
        },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 2_000,
        commitSequence: 2,
      }],
      changedSessionIds: [sessionId],
    })
    expect(events[2]).toMatchObject({
      _tag: "SessionsUpdated",
      protocolVersion: 3,
      views: [{
        sessionId,
        freshness: "fresh",
        provenance: { _tag: "Observed" },
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 4_000,
        commitSequence: 3,
      }],
      changedSessionIds: [sessionId],
    })
  }),
)

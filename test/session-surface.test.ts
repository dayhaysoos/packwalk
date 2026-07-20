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
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: {
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
        },
      },
      {
        _tag: "SessionUpdated",
        protocolVersion: 1,
        view: {
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
        },
      },
    ])

    const reconnect = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(reconnect[0]).toMatchObject({
      _tag: "SessionSnapshot",
      view: { commitSequence: 2, state: { _tag: "Polled" } },
    })
  }),
)

it.effect("replaces a restored singleton when startup discovers a different one-session identity", () =>
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
      _tag: "SessionSnapshot",
      view: {
        sessionId: replacementSessionId,
        projectIdentity: "replacement-project",
        state: { _tag: "Discovered" },
        sourceUpdatedAtMs: 1_500,
        observedAtMs: 2_000,
        commitSequence: 8,
      },
    })
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
        event._tag === "SessionSnapshot"
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
        _tag: "SessionSnapshot",
        protocolVersion: 1,
        view: {
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
        },
      },
      {
        _tag: "SessionUpdated",
        protocolVersion: 1,
        view: {
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
        },
      },
      {
        _tag: "SessionUpdated",
        protocolVersion: 1,
        view: {
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
        },
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
        event._tag === "SessionSnapshot"
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
      _tag: "SessionSnapshot",
      view: { commitSequence: 1, state: { _tag: "Discovered" } },
    })
    expect(events[1]).toMatchObject({
      _tag: "SessionUpdated",
      view: {
        commitSequence: 4,
        sourceUpdatedAtMs: 3_500,
        observedAtMs: 5_000,
        state: { _tag: "Polled" },
      },
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
          protocolVersion: 1,
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
      _tag: "SessionSnapshot",
      view: {
        sessionId,
        projectIdentity: "fixture-project",
        state: { _tag: "Discovered" },
        sourceUpdatedAtMs: 2_500,
        observedAtMs: 2_000,
        commitSequence: 1,
      },
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

    expect(events[0]?._tag).toBe("SessionSnapshot")
    expect(events[1]).toEqual({
      _tag: "SessionUnavailable",
      protocolVersion: 1,
      code: "storage-unavailable",
      message: "PackWalk could not commit its current session view",
    })
    expect(events.some((event) => event._tag === "SessionUpdated")).toBe(false)
  }),
)

it.effect("publishes a typed unavailable event when polling loses its source", () =>
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
    expect(events[0]?._tag).toBe("SessionSnapshot")
    expect(events[1]).toEqual({
      _tag: "SessionUnavailable",
      protocolVersion: 1,
      code: "source-unavailable",
      message: "PackWalk could not read supported Codex persisted evidence",
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
    expect(Array.from(first)[0]?._tag).toBe("SessionSnapshot")

    const runtimeFailure = yield* packWalk.lifetime.pipe(
      Effect.flip,
      Effect.forkChild,
    )
    yield* packWalk.persistSourceIdentityForTest(
      "019f77d2-1a10-7cf0-b5df-76eebb4071ac",
    )
    yield* TestClock.adjust("1 second")

    expect(yield* Fiber.join(runtimeFailure)).toMatchObject({
      _tag: "PackWalk.IllegalSessionTransition",
      reason: "session-identity-changed",
    })
  }),
)

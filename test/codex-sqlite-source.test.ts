import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"

import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref, Stream } from "effect"
import { TestClock } from "effect/testing"

import {
  formatSessionEvent,
  runSessionClient,
  type ClientPort,
} from "../src/client/session-client.js"
import { makeCodexIndexedPackWalk } from "./support/codex-indexed-packwalk.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

it.effect("reports the repository root for Codex working directories inside ordinary and worktree repositories", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-project-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )

    for (const marker of ["directory", "file"] as const) {
      const repositoryRoot = join(directory, marker)
      const sessionWorkingDirectory = join(repositoryRoot, "packages", "app")
      mkdirSync(sessionWorkingDirectory, { recursive: true })
      if (marker === "directory") {
        mkdirSync(join(repositoryRoot, ".git"))
      } else {
        writeFileSync(join(repositoryRoot, ".git"), "gitdir: ../metadata\n")
      }

      const packWalk = yield* makeCodexIndexedPackWalk({
        sessionId,
        projectIdentity: sessionWorkingDirectory,
        sourceUpdatedAtMs: 1_000,
        forbiddenContent: "must-not-appear",
      })
      const events = Array.from(
        yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
      )

      expect(events[0]).toMatchObject({
        _tag: "SessionsSnapshot",
        protocolVersion: 4,
        views: [{
          protocolVersion: 2,
          projectIdentity: repositoryRoot,
          freshness: "fresh",
          provenance: { _tag: "Observed" },
        }],
      })
    }
  }),
)

it.effect("preserves the exact Codex working directory when no repository marker is available", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "packwalk-nonrepo-test-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const workingDirectory = `${join(directory, "standalone")}${sep}`
    mkdirSync(workingDirectory, { recursive: true })

    const packWalk = yield* makeCodexIndexedPackWalk({
      sessionId,
      projectIdentity: workingDirectory,
      sourceUpdatedAtMs: 1_000,
      forbiddenContent: "must-not-appear",
    })
    const events = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )

    expect(events[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      protocolVersion: 4,
      views: [{
        protocolVersion: 2,
        projectIdentity: workingDirectory,
        freshness: "fresh",
        provenance: { _tag: "Observed" },
      }],
    })
  }),
)

it.effect("discovers and polls one content-free session from the Codex SQLite thread index", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const forbidden = "synthetic prompt that PackWalk must never read"
    const packWalk = yield* makeCodexIndexedPackWalk({
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
      forbiddenContent: forbidden,
    })

    const firstObserved = yield* Deferred.make<void>()
    const collected = yield* packWalk.events.pipe(
      Stream.tap(() => Deferred.succeed(firstObserved, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    )

    yield* Deferred.await(firstObserved)
    yield* packWalk.persistCodexActivity(sessionId, 2_500)
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))

    expect(events.map((event) => event._tag)).toEqual([
      "SessionsSnapshot",
      "SessionsUpdated",
    ])
    expect(events[0]).toMatchObject({
      protocolVersion: 4,
      views: [
        {
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          freshness: "fresh",
          provenance: { _tag: "Observed" },
          sourceUpdatedAtMs: 1_000,
          commitSequence: 1,
        },
      ],
    })
    expect(events[1]).toMatchObject({
      protocolVersion: 4,
      changedSessionIds: [sessionId],
      views: [
        {
          protocolVersion: 2,
          sessionId,
          projectIdentity: "fixture-project",
          freshness: "fresh",
          provenance: { _tag: "Observed" },
          sourceUpdatedAtMs: 2_500,
          commitSequence: 2,
        },
      ],
    })
    expect(JSON.stringify(events)).not.toContain(forbidden)
  }),
)

it.effect("renders one later persisted Codex update as a complete CLI frame through real IPC", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeCodexIndexedPackWalk({
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
      forbiddenContent: "must-not-appear",
    })
    const frames = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const firstRendered = yield* Deferred.make<void>()
    const client: ClientPort = {
      writeFrame: (lines) =>
        Ref.updateAndGet(frames, (rendered) => [...rendered, lines]).pipe(
          Effect.flatMap((rendered) =>
            rendered.length === 1
              ? Deferred.succeed(firstRendered, undefined)
              : Effect.void,
          ),
        ),
    }
    const rendering = yield* runSessionClient(
      packWalk.events.pipe(Stream.take(2)),
      client,
    ).pipe(Effect.forkChild)

    yield* Deferred.await(firstRendered)
    yield* packWalk.persistCodexActivity(sessionId, 2_500)
    yield* TestClock.adjust("1 second")
    yield* Fiber.join(rendering)

    const rendered = yield* Ref.get(frames)
    expect(rendered).toHaveLength(2)
    const initial = rendered[0]?.join("\n") ?? ""
    const updated = rendered[1]?.join("\n") ?? ""
    for (const frame of [initial, updated]) {
      expect(frame).toContain("fixture-project")
      expect(frame).toContain(sessionId)
      expect(frame).toContain("persisted Codex activity")
      expect(frame).toContain("codex-sqlite-thread-index")
      expect(frame).toContain("fresh")
      expect(frame).toContain("OBSERVED")
    }
    expect(initial).toContain("DISCOVERED")
    expect(initial).toContain("1970-01-01T00:00:01.000Z")
    expect(initial).toContain("1970-01-01T00:00:02.000Z")
    expect(updated).toContain("POLLED")
    expect(updated).toContain("1970-01-01T00:00:02.500Z")
    expect(updated).toContain("1970-01-01T00:00:03.000Z")
    expect(updated).not.toBe(initial)
  }),
)

it.effect("adds a newly discovered identity without replacing the stored exact session", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const replacementSessionId =
      "019f77d2-1a10-7cf0-b5df-76eebb4071ac"
    const packWalk = yield* makeCodexIndexedPackWalk({
      sessionId,
      projectIdentity: "first-project",
      sourceUpdatedAtMs: 1_000,
      forbiddenContent: "must-not-appear",
    })

    const first = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(first[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      protocolVersion: 4,
      views: [{
        protocolVersion: 2,
        sessionId,
        projectIdentity: "first-project",
        freshness: "fresh",
        provenance: { _tag: "Observed" },
      }],
    })

    yield* packWalk.replaceCodexSession(sessionId, {
      sessionId: replacementSessionId,
      projectIdentity: "replacement-project",
      sourceUpdatedAtMs: 2_500,
    })
    yield* TestClock.adjust("1 second")

    const reconnected = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )
    expect(reconnected[0]).toMatchObject({
      _tag: "SessionsSnapshot",
      protocolVersion: 4,
      views: [
        {
          protocolVersion: 2,
          sessionId,
          projectIdentity: "first-project",
          state: { _tag: "Discovered" },
          freshness: "stale",
          provenance: {
            _tag: "Retained",
            reason: "source-unavailable",
          },
          sourceUpdatedAtMs: 1_000,
          observedAtMs: 2_000,
          commitSequence: 2,
        },
        {
          protocolVersion: 2,
          sessionId: replacementSessionId,
          projectIdentity: "replacement-project",
          state: { _tag: "Discovered" },
          freshness: "fresh",
          provenance: { _tag: "Observed" },
          sourceUpdatedAtMs: 2_500,
          observedAtMs: 3_000,
          commitSequence: 3,
        },
      ],
    })
  }),
)

it.effect("rejects duplicate exact Codex session identities before selecting a row", () =>
  Effect.gen(function* () {
    const forbidden = "conflicting-source-detail"
    const packWalk = yield* makeCodexIndexedPackWalk([
      {
        sessionId,
        projectIdentity: `first-project-${forbidden}`,
        sourceUpdatedAtMs: 1_000,
        forbiddenContent: `${forbidden}-first`,
      },
      {
        sessionId,
        projectIdentity: `second-project-${forbidden}`,
        sourceUpdatedAtMs: 2_000,
        forbiddenContent: `${forbidden}-second`,
      },
    ])

    const events = Array.from(
      yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
    )

    expect(events).toEqual([
      {
        _tag: "SessionUnavailable",
        protocolVersion: 4,
        code: "source-ambiguous",
        message: "PackWalk found ambiguous Codex persisted evidence",
      },
    ])
    const event = events[0]
    if (event === undefined) {
      return yield* Effect.die("Expected an ambiguous source event")
    }
    expect(formatSessionEvent(event).join("\n")).toContain("UNAVAILABLE")
    expect(JSON.stringify(events)).not.toContain(sessionId)
    expect(JSON.stringify(events)).not.toContain(forbidden)
  }),
)

it.effect("rejects Codex rows whose structural identity or timestamp is incompatible", () =>
  Effect.gen(function* () {
    const incompatibleFixtures = [
      {
        sessionId: "",
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
      },
      {
        sessionId,
        projectIdentity: "",
        sourceUpdatedAtMs: 1_000,
      },
      {
        sessionId: "a".repeat(4_097),
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
      },
      {
        sessionId,
        projectIdentity: "€".repeat(1_366),
        sourceUpdatedAtMs: 1_000,
      },
      {
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: -1,
      },
      {
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1.5,
      },
      {
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 8_640_000_000_000_001,
      },
      {
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: Number.MAX_SAFE_INTEGER + 1,
      },
    ]

    for (const fixture of incompatibleFixtures) {
      const packWalk = yield* makeCodexIndexedPackWalk({
        ...fixture,
        forbiddenContent: "must-not-appear",
      })
      const events = Array.from(
        yield* packWalk.events.pipe(Stream.take(1), Stream.runCollect),
      )

      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        _tag: "SessionUnavailable",
        protocolVersion: 4,
        message: "PackWalk could not read supported Codex persisted evidence",
      })
      if (events[0]?._tag === "SessionUnavailable") {
        expect(["source-incompatible", "source-unavailable"]).toContain(
          events[0].code,
        )
      }
    }
  }),
)

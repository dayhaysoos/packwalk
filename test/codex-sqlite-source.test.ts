import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"

import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"

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
        _tag: "SessionSnapshot",
        view: { projectIdentity: repositoryRoot },
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
      _tag: "SessionSnapshot",
      view: { projectIdentity: workingDirectory },
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
    yield* packWalk.persistCodexActivity(2_500)
    yield* TestClock.adjust("1 second")

    const events = Array.from(yield* Fiber.join(collected))

    expect(events.map((event) => event._tag)).toEqual([
      "SessionSnapshot",
      "SessionUpdated",
    ])
    expect(events[0]).toMatchObject({
      view: {
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 1_000,
        commitSequence: 1,
      },
    })
    expect(events[1]).toMatchObject({
      view: {
        sessionId,
        projectIdentity: "fixture-project",
        sourceUpdatedAtMs: 2_500,
        commitSequence: 2,
      },
    })
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
        protocolVersion: 1,
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

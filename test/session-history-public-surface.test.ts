import { createConnection } from "node:net"

import { expect, it } from "@effect/vitest"
import { Effect, Exit, Option, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"

import {
  makeDeterministicPackWalk,
  makeRestartableDeterministicPackWalk,
} from "./support/deterministic-packwalk.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const queryHistoryPage = (
  endpoint: string,
  command: unknown,
): Effect.Effect<unknown, Error> =>
  Effect.tryPromise({
    try: () =>
      new Promise<unknown>((resolve, reject) => {
        const socket = createConnection(endpoint)
        let buffered = ""
        let completed = false
        let timer: ReturnType<typeof setTimeout>
        const finish = (complete: () => void): void => {
          if (completed) return
          completed = true
          clearTimeout(timer)
          socket.destroy()
          complete()
        }
        timer = setTimeout(
          () => finish(() => reject(new Error("History page response timed out"))),
          2_000,
        )
        socket.setEncoding("utf8")
        socket.once("error", (error) => finish(() => reject(error)))
        socket.once("connect", () => {
          socket.write(`${JSON.stringify(command)}\n`)
        })
        socket.on("data", (chunk: string) => {
          buffered += chunk
          const lineEnd = buffered.indexOf("\n")
          if (lineEnd < 0) return
          const line = buffered.slice(0, lineEnd)
          try {
            const decoded: unknown = JSON.parse(line)
            finish(() => resolve(decoded))
          } catch (error) {
            finish(() =>
              reject(error instanceof Error ? error : new Error("Invalid JSON")),
            )
          }
        })
      }),
    catch: (error) =>
      error instanceof Error ? error : new Error("History page query failed"),
  })

it.effect("inspects one committed content-free fact through the public daemon seam", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })

    const first = yield* packWalk.inspectHistory(sessionId)
    const second = yield* packWalk.inspectHistory(sessionId)

    expect(first).toEqual({
      _tag: "SessionHistory",
      protocolVersion: 4,
      sessionId,
      explainedView: {
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
      },
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
          origin: { _tag: "Committed", recordedAtMs: 2_000 },
          view: {
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
          },
        },
      ],
    })
    expect(second).toEqual(first)
  }),
)

it.effect("reports a nonexistent exact-session continuation as an invalid cursor", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(2_000)
    const packWalk = yield* makeDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "fixture-project",
      sourceUpdatedAtMs: 1_000,
    })

    const result = yield* queryHistoryPage(packWalk.endpointForTest, {
      _tag: "InspectSessionHistory",
      protocolVersion: 4,
      sessionId,
      cursor: {
        afterCommitSequence: 1,
        throughCommitSequence: 999,
      },
    })

    expect(result).toMatchObject({
      _tag: "SessionHistoryUnavailable",
      protocolVersion: 4,
      sessionId,
      code: "invalid-history-cursor",
      message: "PackWalk could not continue that retained session history query",
    })
  }),
)

it.effect("retains causal omission, unsupported, and recovery facts across restart", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(5_000)
    const packWalk = yield* makeRestartableDeterministicPackWalk({
      version: 1,
      sessionId,
      projectIdentity: "C:\\work\\fixture-project",
      sourceUpdatedAtMs: 1_000,
    })
    const firstScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(firstScope, Exit.void))
    yield* packWalk.startDaemonIn(firstScope)

    const refresh = Effect.gen(function* () {
      const event = yield* packWalk.events.pipe(Stream.runHead)
      if (Option.isNone(event)) return yield* Effect.die("Expected public overview")
      return event.value
    })

    yield* TestClock.setTime(4_000)
    yield* packWalk.persistSourceUpdate({ sourceUpdatedAtMs: 2_000 })
    yield* refresh

    yield* TestClock.setTime(3_000)
    yield* packWalk.loseSourceForTest
    yield* refresh

    yield* TestClock.setTime(2_000)
    yield* packWalk.restoreSourceForTest
    yield* refresh

    yield* TestClock.setTime(1_000)
    yield* packWalk.rejectDiscoveryForTest
    yield* refresh

    yield* TestClock.setTime(0)
    yield* packWalk.acceptDiscoveryForTest
    yield* refresh

    const beforeRestart = yield* packWalk.inspectHistory(sessionId)
    expect(beforeRestart._tag).toBe("SessionHistory")
    if (beforeRestart._tag !== "SessionHistory") {
      return yield* Effect.die("Expected retained session history")
    }
    expect(beforeRestart.facts.map((fact) => ({
      commit: fact.view.commitSequence,
      observedAtMs: fact.view.observedAtMs,
      recordedAtMs:
        fact.origin._tag === "Committed" ? fact.origin.recordedAtMs : null,
      freshness: fact.view.freshness,
      provenance: fact.view.provenance,
    }))).toEqual([
      {
        commit: 1,
        observedAtMs: 5_000,
        recordedAtMs: 5_000,
        freshness: "fresh",
        provenance: { _tag: "Observed" },
      },
      {
        commit: 2,
        observedAtMs: 4_000,
        recordedAtMs: 4_000,
        freshness: "fresh",
        provenance: { _tag: "Observed" },
      },
      {
        commit: 3,
        observedAtMs: 4_000,
        recordedAtMs: 3_000,
        freshness: "stale",
        provenance: { _tag: "Retained", reason: "source-unavailable" },
      },
      {
        commit: 4,
        observedAtMs: 2_000,
        recordedAtMs: 2_000,
        freshness: "fresh",
        provenance: { _tag: "Observed" },
      },
      {
        commit: 5,
        observedAtMs: 2_000,
        recordedAtMs: 1_000,
        freshness: "stale",
        provenance: { _tag: "Retained", reason: "source-unsupported" },
      },
      {
        commit: 6,
        observedAtMs: 0,
        recordedAtMs: 0,
        freshness: "fresh",
        provenance: { _tag: "Observed" },
      },
    ])
    expect(beforeRestart.explainedView).toEqual(
      beforeRestart.facts.at(-1)?.view,
    )

    yield* Scope.close(firstScope, Exit.void)
    const secondScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(secondScope, Exit.void))
    yield* packWalk.startDaemonIn(secondScope)
    const afterRestart = yield* packWalk.inspectHistory(sessionId)
    expect(afterRestart).toEqual(beforeRestart)
    expect(yield* packWalk.inspectHistory(sessionId.replace(/ab$/u, "AB"))).toMatchObject({
      _tag: "SessionHistoryUnavailable",
      code: "session-not-found",
    })
    expect(yield* packWalk.inspectHistory(sessionId)).toEqual(afterRestart)
    yield* Scope.close(secondScope, Exit.void)
  }),
)

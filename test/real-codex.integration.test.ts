import { mkdtempSync, rmSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"

import {
  connectSessionEvents,
  inspectSessionHistory,
} from "../src/adapters/local-session-ipc.js"
import {
  RuntimePaths,
  runtimePathsLayer,
} from "../src/adapters/runtime-paths.js"
import {
  codexSourceLayer,
  layer as sqliteSessionStorageLayer,
} from "../src/adapters/sqlite-session-storage.js"
import { sessionDaemonLayer } from "../src/daemon/session-runtime.js"
import { isNativeStorageQualified } from "./support/native-storage.js"

const nativePackWalkDataRoot =
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : process.platform === "linux"
      ? process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
      : process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local")

const realCodexTest = it.live.skipIf(
  !isNativeStorageQualified(nativePackWalkDataRoot),
)

realCodexTest("observes one later persisted update from an ordinary existing Codex session", () =>
  Effect.gen(function* () {
    const paths = yield* RuntimePaths
    const directory = yield* Effect.acquireRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), "pw-real-"))),
      (path) => Effect.sync(() => rmSync(path, { recursive: true, force: true })),
    )
    const endpoint =
      process.platform === "win32"
        ? `\\\\.\\pipe\\packwalk-real-${randomUUID()}`
        : join(directory, "daemon.sock")
    const dependencies = Layer.mergeAll(
      codexSourceLayer(paths.codexDatabasePath),
      sqliteSessionStorageLayer(join(directory, "packwalk.sqlite")),
    )
    yield* Layer.build(
      sessionDaemonLayer(endpoint).pipe(Layer.provide(dependencies)),
    )

    const observations = yield* connectSessionEvents(endpoint).pipe(
      Effect.flatMap((stream) =>
        stream.pipe(
          Stream.mapAccum(
            () => new Map<string, number>(),
            (
              initialSourceUpdatedAtMsBySession,
              event,
            ): readonly [
              ReadonlyMap<string, number>,
              ReadonlyArray<{
                readonly event: typeof event
                readonly updatedSessionId: string | undefined
              }>,
            ] => {
              const initial =
                initialSourceUpdatedAtMsBySession.size === 0 &&
                event._tag === "SessionsSnapshot"
                  ? new Map(
                      event.views.map((view) => [
                        view.sessionId as string,
                        view.sourceUpdatedAtMs,
                      ]),
                    )
                  : initialSourceUpdatedAtMsBySession
              const updatedSessionId =
                event._tag === "SessionsUpdated"
                  ? event.changedSessionIds.find((sessionId) => {
                      const initialSourceUpdatedAtMs = initial.get(sessionId)
                      const updatedView = event.views.find(
                        (view) => view.sessionId === sessionId,
                      )
                      return (
                        initialSourceUpdatedAtMs !== undefined &&
                        updatedView !== undefined &&
                        updatedView.sourceUpdatedAtMs > initialSourceUpdatedAtMs
                      )
                    })
                  : undefined

              return [initial, [{ event, updatedSessionId }]]
            },
          ),
          Stream.takeUntil(
            (observation) => observation.updatedSessionId !== undefined,
          ),
          Stream.runCollect,
        ),
      ),
      Effect.timeoutOrElse({
        duration: "110 seconds",
        orElse: () =>
          Effect.fail(
            new Error(
              "No later persisted Codex activity was observed; keep an ordinary Codex session active while this opt-in check runs",
            ),
          ),
      }),
    )
    const collected = Array.from(observations)
    const initial = collected[0]?.event
    const updateObservation = collected.at(-1)
    const update = updateObservation?.event

    expect(initial?._tag).toBe("SessionsSnapshot")
    expect(update?._tag).toBe("SessionsUpdated")
    if (
      initial?._tag !== "SessionsSnapshot" ||
      update?._tag !== "SessionsUpdated" ||
      updateObservation === undefined ||
      updateObservation.updatedSessionId === undefined
    ) {
      return
    }

    const initialView = initial.views.find(
      (view) => view.sessionId === updateObservation.updatedSessionId,
    )
    const updatedView = update.views.find(
      (view) => view.sessionId === updateObservation.updatedSessionId,
    )
    expect(initialView).toBeDefined()
    expect(updatedView).toBeDefined()
    if (initialView === undefined || updatedView === undefined) return

    expect(initial.protocolVersion).toBe(4)
    expect(update.protocolVersion).toBe(4)
    expect(initialView).toMatchObject({
      protocolVersion: 2,
      freshness: "fresh",
      provenance: { _tag: "Observed" },
    })
    expect(updatedView).toMatchObject({
      protocolVersion: 2,
      freshness: "fresh",
      provenance: { _tag: "Observed" },
    })
    expect(initialView.projectIdentity.length > 0).toBe(true)
    expect(initialView.sessionId.length > 0).toBe(true)
    expect(updatedView.commitSequence).toBeGreaterThan(
      initialView.commitSequence,
    )
    expect(updatedView.sourceUpdatedAtMs > initialView.sourceUpdatedAtMs).toBe(
      true,
    )
    expect(updatedView.state._tag).toBe("Polled")

    const history = yield* inspectSessionHistory(
      endpoint,
      updatedView.sessionId,
    )
    expect(history._tag).toBe("SessionHistory")
    if (history._tag !== "SessionHistory") return
    expect(history.sessionId).toBe(updatedView.sessionId)
    expect(history.explainedView).toEqual(updatedView)
    expect(history.facts.at(-1)?.view).toEqual(updatedView)
    expect(history.facts.some(
      (fact) => fact.view.commitSequence === initialView.commitSequence,
    )).toBe(true)
    expect(history.facts.map((fact) => fact.view.commitSequence)).toEqual(
      [...history.facts]
        .map((fact) => fact.view.commitSequence)
        .sort((left, right) => left - right),
    )
  }).pipe(
    Effect.provide(Layer.merge(NodeServices.layer, runtimePathsLayer)),
  ),
)

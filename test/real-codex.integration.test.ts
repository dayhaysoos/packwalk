import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Stream } from "effect"

import { connectSessionEvents } from "../src/adapters/local-session-ipc.js"
import {
  RuntimePaths,
  runtimePathsLayer,
} from "../src/adapters/runtime-paths.js"
import {
  codexSourceLayer,
  layer as sqliteSessionStorageLayer,
} from "../src/adapters/sqlite-session-storage.js"
import { sessionDaemonLayer } from "../src/daemon/session-runtime.js"

it.live("observes one later persisted update from an ordinary existing Codex session", () =>
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
            () => Option.none<number>(),
            (
              initialSourceUpdatedAtMs,
              event,
            ): readonly [
              Option.Option<number>,
              ReadonlyArray<{
                readonly event: typeof event
                readonly isLaterPersistedUpdate: boolean
              }>,
            ] => {
              const initial =
                Option.isNone(initialSourceUpdatedAtMs) &&
                event._tag === "SessionSnapshot"
                  ? Option.some(event.view.sourceUpdatedAtMs)
                  : initialSourceUpdatedAtMs
              const isLaterPersistedUpdate =
                Option.isSome(initial) &&
                event._tag === "SessionUpdated" &&
                event.view.sourceUpdatedAtMs > initial.value

              return [initial, [{ event, isLaterPersistedUpdate }]]
            },
          ),
          Stream.takeUntil((observation) => observation.isLaterPersistedUpdate),
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
    const update = collected.at(-1)?.event

    expect(initial?._tag).toBe("SessionSnapshot")
    expect(update?._tag).toBe("SessionUpdated")
    if (
      initial?._tag !== "SessionSnapshot" ||
      update?._tag !== "SessionUpdated"
    ) {
      return
    }

    expect(initial.view.projectIdentity.length > 0).toBe(true)
    expect(initial.view.sessionId.length > 0).toBe(true)
    expect(update.view.sessionId === initial.view.sessionId).toBe(true)
    expect(update.view.commitSequence).toBeGreaterThan(
      initial.view.commitSequence,
    )
    expect(update.view.sourceUpdatedAtMs > initial.view.sourceUpdatedAtMs).toBe(
      true,
    )
    expect(update.view.state._tag).toBe("Polled")
  }).pipe(
    Effect.provide(Layer.merge(NodeServices.layer, runtimePathsLayer)),
  ),
)

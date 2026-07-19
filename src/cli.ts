#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"

import { startPackWalkDaemon } from "./adapters/daemon-launcher.js"
import { connectSessionEvents } from "./adapters/local-session-ipc.js"
import {
  prepareRuntimeDirectories,
  RuntimePaths,
  runtimePathsLayer,
} from "./adapters/runtime-paths.js"
import { connectOrStart } from "./application/cli-startup.js"
import {
  makePlainCliOutput,
  writeCliFailure,
} from "./client/plain-cli-output.js"
import { runSessionClient } from "./client/session-client.js"

const cliProgram = Effect.scoped(
  Effect.gen(function* () {
    const paths = yield* RuntimePaths
    yield* prepareRuntimeDirectories
    const events = yield* connectOrStart({
      connect: connectSessionEvents(paths.ipcEndpoint),
      startDaemon: startPackWalkDaemon,
      retryDelay: "100 millis",
      retryAttempts: 50,
    })
    const output = yield* makePlainCliOutput

    yield* runSessionClient(events, output)
  }),
)

cliProgram.pipe(
  Effect.catch(() =>
    writeCliFailure.pipe(
      Effect.orDie,
      Effect.andThen(Effect.fail("packwalk-unavailable" as const)),
    ),
  ),
  Effect.provide(Layer.merge(NodeServices.layer, runtimePathsLayer)),
  NodeRuntime.runMain({ disableErrorReporting: true }),
)

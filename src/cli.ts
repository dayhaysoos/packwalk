#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { EOL } from "node:os"
import { Effect, Layer, Stdio } from "effect"

import { startPackWalkDaemon } from "./adapters/daemon-launcher.js"
import { connectSessionEvents } from "./adapters/local-session-ipc.js"
import {
  prepareRuntimeDirectories,
  RuntimePaths,
  runtimePathsLayer,
  verifyRuntimeAuthority,
} from "./adapters/runtime-paths.js"
import { connectOrStart } from "./application/cli-startup.js"
import {
  CliCommand,
  CliUsageError,
  parseCliCommand,
} from "./application/cli-command.js"
import {
  makeOneShotCliOutput,
  makePlainCliOutput,
  writeCliFailure,
  writeCliUsage,
} from "./client/plain-cli-output.js"
import { runOneShotSessionClient } from "./client/one-shot-session-client.js"
import { runSessionClient } from "./client/session-client.js"

const cliProgram = Effect.scoped(
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    const command = yield* parseCliCommand(yield* stdio.args)
    const paths = yield* RuntimePaths
    yield* prepareRuntimeDirectories
    yield* verifyRuntimeAuthority(paths)
    const events = yield* connectOrStart({
      connect: connectSessionEvents(paths.ipcEndpoint),
      startDaemon: startPackWalkDaemon,
      retryDelay: "100 millis",
      retryAttempts: 50,
    })
    yield* CliCommand.$match(command, {
      Refresh: () =>
        makePlainCliOutput.pipe(
          Effect.flatMap((output) => runSessionClient(events, output)),
        ),
      OneShot: ({ format }) =>
        makeOneShotCliOutput.pipe(
          Effect.flatMap((output) =>
            runOneShotSessionClient(events, output, {
              format,
              lineSeparator: EOL,
            }),
          ),
        ),
    })
  }),
)

cliProgram.pipe(
  Effect.catch((failure) =>
    (failure instanceof CliUsageError
      ? writeCliUsage(failure.usage, EOL)
      : writeCliFailure(EOL)
    ).pipe(
      Effect.orDie,
      Effect.andThen(Effect.fail("packwalk-command-failed" as const)),
    ),
  ),
  Effect.provide(Layer.merge(NodeServices.layer, runtimePathsLayer)),
  NodeRuntime.runMain({ disableErrorReporting: true }),
)

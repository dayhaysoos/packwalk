#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { EOL } from "node:os"
import { Effect, Layer, Stdio } from "effect"

import { startPackWalkDaemon } from "./adapters/daemon-launcher.js"
import {
  connectSessionEvents,
  inspectSessionHistory,
} from "./adapters/local-session-ipc.js"
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
import { runSessionHistoryClient } from "./client/session-history-client.js"

const daemonRetryDelay = "100 millis" as const
const daemonRetryAttempts = 300
const daemonStartupDeadline = "30 seconds" as const

const cliProgram = Effect.scoped(
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    const command = yield* parseCliCommand(yield* stdio.args)
    const paths = yield* RuntimePaths
    yield* prepareRuntimeDirectories
    yield* verifyRuntimeAuthority(paths)
    const connectEvents = connectOrStart({
      connect: connectSessionEvents(paths.ipcEndpoint),
      startDaemon: startPackWalkDaemon,
      retryDelay: daemonRetryDelay,
      retryAttempts: daemonRetryAttempts,
      startupDeadline: daemonStartupDeadline,
    })
    yield* CliCommand.$match(command, {
      Refresh: () =>
        connectEvents.pipe(
          Effect.flatMap((events) =>
            makePlainCliOutput.pipe(
              Effect.flatMap((output) => runSessionClient(events, output)),
            ),
          ),
        ),
      OneShot: ({ format }) =>
        connectEvents.pipe(
          Effect.flatMap((events) =>
            makeOneShotCliOutput.pipe(
              Effect.flatMap((output) =>
                runOneShotSessionClient(events, output, {
                  format,
                  lineSeparator: EOL,
                }),
              ),
            ),
          ),
        ),
      Inspect: ({ sessionId, format }) =>
        connectOrStart({
          connect: inspectSessionHistory(paths.ipcEndpoint, sessionId),
          startDaemon: startPackWalkDaemon,
          retryDelay: daemonRetryDelay,
          retryAttempts: daemonRetryAttempts,
          startupDeadline: daemonStartupDeadline,
        }).pipe(
          Effect.flatMap((history) =>
            makeOneShotCliOutput.pipe(
              Effect.flatMap((output) =>
                runSessionHistoryClient(history, output, {
                  format,
                  lineSeparator: EOL,
                }),
              ),
            ),
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

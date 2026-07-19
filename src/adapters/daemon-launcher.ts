import { fileURLToPath } from "node:url"

import { Effect, Schema } from "effect"
import * as ChildProcess from "effect/unstable/process/ChildProcess"

export class DaemonStartError extends Schema.TaggedErrorClass<DaemonStartError>()(
  "PackWalk.DaemonStartError",
  { message: Schema.String },
) {}

export const daemonLaunchOptions = (
  _platform: NodeJS.Platform,
): ChildProcess.CommandOptions => ({
  detached: true,
  stdin: "ignore",
  stdout: "ignore",
  stderr: "ignore",
  extendEnv: true,
})

export const startPackWalkDaemon = Effect.scoped(
  Effect.gen(function* () {
    const daemonEntry = fileURLToPath(new URL("../daemon.js", import.meta.url))
    const handle = yield* ChildProcess.make(
      process.execPath,
      [daemonEntry],
      daemonLaunchOptions(process.platform),
    ).pipe(
      Effect.mapError(
        () =>
          new DaemonStartError({
            message: "PackWalk could not start its local daemon",
          }),
      ),
    )

    yield* handle.unref.pipe(
      Effect.mapError(
        () =>
          new DaemonStartError({
            message: "PackWalk could not detach its local daemon",
          }),
      ),
    )
  }),
)

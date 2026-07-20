import { Effect, Result, Schedule, Schema } from "effect"
import type * as Duration from "effect/Duration"

export class CliStartupError extends Schema.TaggedErrorClass<CliStartupError>()(
  "PackWalk.CliStartupError",
  { reason: Schema.Literal("startup-deadline-exceeded") },
) {}

export interface ConnectOrStartOptions<A, E, E2, R, R2> {
  readonly connect: Effect.Effect<A, E, R>
  readonly startDaemon: Effect.Effect<void, E2, R2>
  readonly retryDelay: Duration.Input
  readonly retryAttempts: number
  readonly startupDeadline: Duration.Input
}

export const connectOrStart = <A, E, E2, R, R2>(
  options: ConnectOrStartOptions<A, E, E2, R, R2>,
): Effect.Effect<A, E | E2 | CliStartupError, R | R2> =>
  Effect.gen(function* () {
    const initial = yield* Effect.result(options.connect)
    if (Result.isSuccess(initial)) {
      return initial.success
    }

    yield* options.startDaemon

    const retryAttempts = Math.max(1, options.retryAttempts)
    const retrySchedule = Schedule.spaced(options.retryDelay).pipe(
      Schedule.upTo({ times: retryAttempts - 1 }),
    )

    return yield* options.connect.pipe(
      Effect.retry(retrySchedule),
      Effect.delay(options.retryDelay),
    )
  }).pipe(
    Effect.timeoutOrElse({
      duration: options.startupDeadline,
      orElse: () =>
        Effect.fail(
          new CliStartupError({ reason: "startup-deadline-exceeded" }),
        ),
    }),
  )

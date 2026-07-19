import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Ref } from "effect"
import { TestClock } from "effect/testing"

import { connectOrStart } from "../src/application/cli-startup.js"

it.effect("starts the PackWalk daemon once and reconnects without starting Codex", () =>
  Effect.gen(function* () {
    const connectionAttempts = yield* Ref.make(0)
    const daemonStarts = yield* Ref.make(0)
    const connect = Ref.updateAndGet(connectionAttempts, (count) => count + 1).pipe(
      Effect.flatMap((attempt) =>
        attempt === 1
          ? Effect.fail("daemon-unavailable" as const)
          : Effect.succeed("session-events" as const),
      ),
    )
    const startDaemon = Ref.update(daemonStarts, (count) => count + 1)

    const connected = yield* connectOrStart({
      connect,
      startDaemon,
      retryDelay: "100 millis",
      retryAttempts: 3,
    }).pipe(Effect.forkChild)

    yield* Effect.yieldNow
    expect(yield* Ref.get(daemonStarts)).toBe(1)
    expect(yield* Ref.get(connectionAttempts)).toBe(1)

    yield* TestClock.adjust("100 millis")

    expect(yield* Fiber.join(connected)).toBe("session-events")
    expect(yield* Ref.get(connectionAttempts)).toBe(2)
    expect(yield* Ref.get(daemonStarts)).toBe(1)
  }),
)

it.effect("bounds reconnect attempts and preserves the delay between them", () =>
  Effect.gen(function* () {
    const connectionAttempts = yield* Ref.make(0)
    const daemonStarts = yield* Ref.make(0)
    const connect = Ref.update(connectionAttempts, (count) => count + 1).pipe(
      Effect.andThen(Effect.fail("daemon-unavailable" as const)),
    )
    const startDaemon = Ref.update(daemonStarts, (count) => count + 1)

    const connected = yield* connectOrStart({
      connect,
      startDaemon,
      retryDelay: "100 millis",
      retryAttempts: 3,
    }).pipe(Effect.forkChild)

    yield* Effect.yieldNow
    expect(yield* Ref.get(connectionAttempts)).toBe(1)

    yield* TestClock.adjust("100 millis")
    expect(yield* Ref.get(connectionAttempts)).toBe(2)

    yield* TestClock.adjust("100 millis")
    expect(yield* Ref.get(connectionAttempts)).toBe(3)

    yield* TestClock.adjust("100 millis")
    expect(yield* Fiber.join(connected).pipe(Effect.flip)).toBe(
      "daemon-unavailable",
    )
    expect(yield* Ref.get(connectionAttempts)).toBe(4)
    expect(yield* Ref.get(daemonStarts)).toBe(1)
  }),
)

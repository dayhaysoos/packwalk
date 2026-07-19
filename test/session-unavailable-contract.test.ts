import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"

import { SessionEvent } from "../src/domain/session.js"

const readFailureMessage =
  "PackWalk could not read supported Codex persisted evidence" as const
const commitFailureMessage =
  "PackWalk could not commit its current session view" as const

const decode = Schema.decodeUnknownEffect(SessionEvent, {
  onExcessProperty: "error",
})

it.effect("round-trips every valid unavailable code and message pair", () =>
  Effect.gen(function* () {
    const validPairs = [
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "source-unavailable",
        message: readFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "source-incompatible",
        message: readFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "storage-unavailable",
        message: commitFailureMessage,
      },
    ] as const

    for (const input of validPairs) {
      const decoded = yield* decode(input)
      const encoded = yield* Schema.encodeEffect(SessionEvent)(decoded)
      expect(encoded).toEqual(input)
    }
  }),
)

it.effect("rejects every mismatched unavailable code and message pair", () =>
  Effect.gen(function* () {
    const mismatchedPairs = [
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "source-unavailable",
        message: commitFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "source-incompatible",
        message: commitFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "storage-unavailable",
        message: readFailureMessage,
      },
    ] as const

    for (const input of mismatchedPairs) {
      const result = yield* decode(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

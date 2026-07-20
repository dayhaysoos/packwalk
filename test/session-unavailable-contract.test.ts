import { expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"

import { SessionEvent } from "../src/domain/session.js"

const readFailureMessage =
  "PackWalk could not read supported Codex persisted evidence" as const
const commitFailureMessage =
  "PackWalk could not commit its current session view" as const
const ambiguousFailureMessage =
  "PackWalk found ambiguous Codex persisted evidence" as const
const overviewFailureMessage =
  "PackWalk could not publish its current session overview" as const

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
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "source-ambiguous",
        message: ambiguousFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "overview-unavailable",
        message: overviewFailureMessage,
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
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "source-ambiguous",
        message: readFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "source-unavailable",
        message: ambiguousFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "source-ambiguous",
        message: ambiguousFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 2,
        code: "overview-unavailable",
        message: readFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 1,
        code: "overview-unavailable",
        message: overviewFailureMessage,
      },
    ] as const

    for (const input of mismatchedPairs) {
      const result = yield* decode(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

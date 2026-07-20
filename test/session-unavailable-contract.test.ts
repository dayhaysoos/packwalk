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

const validUnavailablePairs = [
  {
    code: "source-unavailable",
    message: readFailureMessage,
  },
  {
    code: "source-incompatible",
    message: readFailureMessage,
  },
  {
    code: "storage-unavailable",
    message: commitFailureMessage,
  },
  {
    code: "source-ambiguous",
    message: ambiguousFailureMessage,
  },
  {
    code: "overview-unavailable",
    message: overviewFailureMessage,
  },
] as const

const decode = Schema.decodeUnknownEffect(SessionEvent, {
  onExcessProperty: "error",
})

it.effect("round-trips every valid unavailable code and message pair", () =>
  Effect.gen(function* () {
    for (const pair of validUnavailablePairs) {
      const input = {
        _tag: "SessionUnavailable",
        protocolVersion: 3,
        ...pair,
      } as const
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
        protocolVersion: 3,
        code: "source-unavailable",
        message: commitFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 3,
        code: "source-incompatible",
        message: commitFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 3,
        code: "storage-unavailable",
        message: readFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 3,
        code: "source-ambiguous",
        message: readFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 3,
        code: "source-unavailable",
        message: ambiguousFailureMessage,
      },
      {
        _tag: "SessionUnavailable",
        protocolVersion: 3,
        code: "overview-unavailable",
        message: readFailureMessage,
      },
    ] as const

    for (const input of mismatchedPairs) {
      const result = yield* decode(input).pipe(Effect.result)
      expect(Result.isFailure(result)).toBe(true)
    }
  }),
)

it.effect("rejects unavailable events from every older protocol version", () =>
  Effect.gen(function* () {
    for (const protocolVersion of [1, 2] as const) {
      for (const pair of validUnavailablePairs) {
        const result = yield* decode({
          _tag: "SessionUnavailable",
          protocolVersion,
          ...pair,
        }).pipe(Effect.result)
        expect(Result.isFailure(result)).toBe(true)
      }
    }
  }),
)

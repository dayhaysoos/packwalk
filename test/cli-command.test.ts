import { expect, it } from "@effect/vitest"
import { Effect } from "effect"

import {
  CliCommand,
  CliUsageError,
  parseCliCommand,
} from "../src/application/cli-command.js"
import { SessionIdentity } from "../src/domain/session.js"

const inspectedSessionId = SessionIdentity.make("session-1")

it.effect("selects refreshing, one-shot, and exact-session inspection commands", () =>
  Effect.gen(function* () {
    expect(yield* parseCliCommand([])).toEqual(CliCommand.Refresh())
    expect(yield* parseCliCommand(["text"])).toEqual(
      CliCommand.OneShot({ format: "text" }),
    )
    expect(yield* parseCliCommand(["json"])).toEqual(
      CliCommand.OneShot({ format: "json" }),
    )
    expect(yield* parseCliCommand(["inspect", "session-1"])).toEqual(
      CliCommand.Inspect({ sessionId: inspectedSessionId, format: "text" }),
    )
    expect(
      yield* parseCliCommand(["inspect", "session-1", "json"]),
    ).toEqual(
      CliCommand.Inspect({ sessionId: inspectedSessionId, format: "json" }),
    )
  }),
)

it.effect("rejects flags, extra arguments, and unknown commands with one deterministic usage", () =>
  Effect.gen(function* () {
    for (const args of [
      ["--json"],
      ["text", "extra"],
      ["watch"],
      ["inspect"],
      ["inspect", ""],
      ["inspect", "session-1", "--json"],
      ["inspect", "session-1", "json", "extra"],
    ]) {
      const failure = yield* parseCliCommand(args).pipe(Effect.flip)
      expect(failure).toEqual(
        new CliUsageError({
          usage:
            "Usage: packwalk [text|json] | packwalk inspect <session-id> [text|json]",
        }),
      )
    }
  }),
)

import { expect, it } from "@effect/vitest"
import { Effect } from "effect"

import {
  CliCommand,
  CliUsageError,
  parseCliCommand,
} from "../src/application/cli-command.js"

it.effect("selects the refreshing, one-shot text, and one-shot JSON commands exactly", () =>
  Effect.gen(function* () {
    expect(yield* parseCliCommand([])).toEqual(CliCommand.Refresh())
    expect(yield* parseCliCommand(["text"])).toEqual(CliCommand.Text())
    expect(yield* parseCliCommand(["json"])).toEqual(CliCommand.Json())
  }),
)

it.effect("rejects flags, extra arguments, and unknown commands with one deterministic usage", () =>
  Effect.gen(function* () {
    for (const args of [["--json"], ["text", "extra"], ["watch"]]) {
      const failure = yield* parseCliCommand(args).pipe(Effect.flip)
      expect(failure).toEqual(
        new CliUsageError({ usage: "Usage: packwalk [text|json]" }),
      )
    }
  }),
)

import { Data, Effect, Schema } from "effect"

export type CliCommand = Data.TaggedEnum<{
  Refresh: {}
  Text: {}
  Json: {}
}>

export const CliCommand = Data.taggedEnum<CliCommand>()

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()(
  "PackWalk.CliUsageError",
  { usage: Schema.Literal("Usage: packwalk [text|json]") },
) {}

const usageError = (): CliUsageError =>
  new CliUsageError({ usage: "Usage: packwalk [text|json]" })

export const parseCliCommand = (
  args: ReadonlyArray<string>,
): Effect.Effect<CliCommand, CliUsageError> => {
  if (args.length === 0) {
    return Effect.succeed(CliCommand.Refresh())
  }
  if (args.length === 1 && args[0] === "text") {
    return Effect.succeed(CliCommand.Text())
  }
  if (args.length === 1 && args[0] === "json") {
    return Effect.succeed(CliCommand.Json())
  }
  return Effect.fail(usageError())
}

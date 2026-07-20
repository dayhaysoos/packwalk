import { Data, Effect, Schema } from "effect"

export type CliCommand = Data.TaggedEnum<{
  Refresh: {}
  OneShot: { readonly format: "text" | "json" }
}>

export const CliCommand = Data.taggedEnum<CliCommand>()

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()(
  "PackWalk.CliUsageError",
  { usage: Schema.Literal("Usage: packwalk [text|json]") },
) {}

const usageError = (): CliUsageError =>
  new CliUsageError({ usage: "Usage: packwalk [text|json]" })

const OneShotFormat = Schema.Literals(["text", "json"])
const CliArguments = Schema.Union([
  Schema.Tuple([]),
  Schema.Tuple([OneShotFormat]),
])

export const parseCliCommand = (
  args: ReadonlyArray<string>,
): Effect.Effect<CliCommand, CliUsageError> =>
  Schema.decodeUnknownEffect(CliArguments, {
    onExcessProperty: "error",
  })(args).pipe(
    Effect.mapError(usageError),
    Effect.map((decoded) =>
      decoded.length === 0
        ? CliCommand.Refresh()
        : CliCommand.OneShot({ format: decoded[0] }),
    ),
  )

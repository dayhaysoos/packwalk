import { Data, Effect, Schema } from "effect"

import { SessionIdentity } from "../domain/session.js"

export type CliCommand = Data.TaggedEnum<{
  Refresh: {}
  OneShot: { readonly format: "text" | "json" }
  Inspect: {
    readonly sessionId: typeof SessionIdentity.Type
    readonly format: "text" | "json"
  }
}>

export const CliCommand = Data.taggedEnum<CliCommand>()

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()(
  "PackWalk.CliUsageError",
  {
    usage: Schema.Literal(
      "Usage: packwalk [text|json] | packwalk inspect <session-id> [text|json]",
    ),
  },
) {}

const usageError = (): CliUsageError =>
  new CliUsageError({
    usage:
      "Usage: packwalk [text|json] | packwalk inspect <session-id> [text|json]",
  })

const OneShotFormat = Schema.Literals(["text", "json"])
const CliArguments = Schema.Union([
  Schema.Tuple([]),
  Schema.Tuple([OneShotFormat]),
  Schema.Tuple([Schema.Literal("inspect"), SessionIdentity]),
  Schema.Tuple([Schema.Literal("inspect"), SessionIdentity, OneShotFormat]),
])

export const parseCliCommand = (
  args: ReadonlyArray<string>,
): Effect.Effect<CliCommand, CliUsageError> =>
  Schema.decodeUnknownEffect(CliArguments, {
    onExcessProperty: "error",
  })(args).pipe(
    Effect.mapError(usageError),
    Effect.map((decoded) => {
      if (decoded.length === 0) return CliCommand.Refresh()
      if (decoded[0] !== "inspect") {
        return CliCommand.OneShot({ format: decoded[0] })
      }
      return CliCommand.Inspect({
        sessionId: decoded[1],
        format: decoded[2] ?? "text",
      })
    }),
  )

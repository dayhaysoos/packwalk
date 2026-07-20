import { Effect, Schema } from "effect"

import {
  SessionHistoryResult,
  type SessionEvidenceFact,
  type SessionHistoryResult as SessionHistoryResultValue,
} from "../domain/session.js"
import type { ClientOutputError } from "./session-client.js"
import type { OneShotClientPort } from "./one-shot-session-client.js"
import { escapeTerminalText, utcTimestamp } from "./terminal-text.js"

export class SessionHistoryClientError extends Schema.TaggedErrorClass<SessionHistoryClientError>()(
  "PackWalk.SessionHistoryClientError",
  { reason: Schema.Literal("invalid-session-history") },
) {}

export interface SessionHistoryClientOptions {
  readonly format: "text" | "json"
  readonly lineSeparator: string
}

const formatFact = (fact: SessionEvidenceFact): ReadonlyArray<string> => {
  const view = fact.view
  return [
    `COMMIT ${view.commitSequence}`,
    `ORIGIN ${fact.origin._tag === "Committed" ? "COMMITTED" : "MIGRATED BASELINE"}`,
    `RECORDED ${fact.origin._tag === "Committed" ? utcTimestamp(fact.origin.recordedAtMs) : "-"}`,
    `PROJECT ${escapeTerminalText(view.projectIdentity)}`,
    `STATE ${view.state._tag.toUpperCase()}`,
    `ACTIVITY ${view.activity}`,
    `EVIDENCE ${view.evidenceSource}`,
    `FRESHNESS ${view.freshness}`,
    `PROVENANCE ${
      view.provenance._tag === "Observed"
        ? "OBSERVED"
        : `RETAINED (${view.provenance.reason})`
    }`,
    `SOURCE UPDATED ${utcTimestamp(view.sourceUpdatedAtMs)}`,
    `OBSERVED ${utcTimestamp(view.observedAtMs)}`,
  ]
}

export const formatSessionHistory = (
  result: SessionHistoryResultValue,
): ReadonlyArray<string> => {
  if (result._tag === "SessionHistoryUnavailable") {
    return [
      `SESSION ${escapeTerminalText(result.sessionId)}`,
      "STATUS UNAVAILABLE",
      `REASON ${result.message}`,
    ]
  }

  return [
    `SESSION ${escapeTerminalText(result.sessionId)}`,
    `EXPLAINS COMMIT ${result.explainedView.commitSequence}`,
    `HISTORY COVERAGE ${result.historyCoverage}`,
    `OMITTED CONTENT ${result.omittedContent.join(", ")}`,
    `UNSUPPORTED FACTS ${result.unsupportedFacts.join(", ")}`,
    "",
    ...result.facts.flatMap((fact, index) => [
      ...(index === 0 ? [] : [""]),
      ...formatFact(fact),
    ]),
  ]
}

const SessionHistoryResultJson = Schema.fromJsonString(SessionHistoryResult)

export const runSessionHistoryClient = Effect.fn("SessionHistoryClient.run")(
  (
    result: SessionHistoryResultValue,
    client: OneShotClientPort,
    options: SessionHistoryClientOptions,
  ): Effect.Effect<
    void,
    ClientOutputError | SessionHistoryClientError
  > => {
    const body = options.format === "text"
      ? Effect.succeed(formatSessionHistory(result).join(options.lineSeparator))
      : Schema.encodeEffect(SessionHistoryResultJson)(result).pipe(
          Effect.mapError(
            () => new SessionHistoryClientError({ reason: "invalid-session-history" }),
          ),
        )

    return body.pipe(
      Effect.flatMap((document) =>
        client.writeDocument(`${document}${options.lineSeparator}`),
      ),
    )
  },
)

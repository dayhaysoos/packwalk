import { Effect, Schema, Stream } from "effect"

import type { SessionEvent, SessionView } from "../domain/session.js"
import { escapeTerminalText, utcTimestamp } from "./terminal-text.js"

export class ClientOutputError extends Schema.TaggedErrorClass<ClientOutputError>()(
  "PackWalk.ClientOutputError",
  { message: Schema.String },
) {}

export interface ClientPort {
  readonly writeFrame: (
    lines: ReadonlyArray<string>,
  ) => Effect.Effect<void, ClientOutputError>
}

const projectWidth = 17
const stateWidth = 11
const sessionWidth = 38
const evidenceWidth = 27
const sourceUpdatedWidth = 26

const formatColumns = (
  columns: ReadonlyArray<readonly [value: string, width?: number]>,
): string =>
  columns
    .map(([value, width]) =>
      width === undefined ? value : value.padEnd(width),
    )
    .join("  ")

const projectName = (identity: string): string => {
  const withoutTrailingSeparators = identity.replace(/[\\/]+$/u, "")
  if (withoutTrailingSeparators.length === 0) {
    return identity
  }
  return withoutTrailingSeparators.split(/[\\/]/u).at(-1) ?? identity
}

interface SessionFrameFields {
  readonly project: string
  readonly state: string
  readonly activity: string
  readonly session: string
  readonly evidence: string
  readonly freshness: string
  readonly provenance: string
  readonly sourceUpdated: string
  readonly observed: string
}

const formatDetails = (
  fields: SessionFrameFields,
): ReadonlyArray<string> => [
  formatColumns([
    ["PROJECT", projectWidth],
    ["STATE", stateWidth],
    ["ACTIVITY"],
  ]),
  formatColumns([
    [fields.project, projectWidth],
    [fields.state, stateWidth],
    [fields.activity],
  ]),
  formatColumns([
    ["SESSION", sessionWidth],
    ["EVIDENCE", evidenceWidth],
    ["FRESHNESS"],
    ["PROVENANCE"],
  ]),
  formatColumns([
    [fields.session, sessionWidth],
    [fields.evidence, evidenceWidth],
    [fields.freshness],
    [fields.provenance],
  ]),
  formatColumns([
    ["SOURCE UPDATED", sourceUpdatedWidth],
    ["OBSERVED"],
  ]),
  formatColumns([
    [fields.sourceUpdated, sourceUpdatedWidth],
    [fields.observed],
  ]),
]

const sessionFrameFields = (view: SessionView): SessionFrameFields => ({
  project: escapeTerminalText(projectName(view.projectIdentity)),
  state: view.state._tag.toUpperCase(),
  activity: view.activity,
  session: escapeTerminalText(view.sessionId),
  evidence: view.evidenceSource,
  freshness: view.freshness,
  provenance:
    view.provenance._tag === "Observed"
      ? "OBSERVED"
      : `RETAINED (${view.provenance.reason})`,
  sourceUpdated: utcTimestamp(view.sourceUpdatedAtMs),
  observed: utcTimestamp(view.observedAtMs),
})

const formatSessionViews = (
  views: ReadonlyArray<SessionView>,
): ReadonlyArray<string> => {
  if (views.length === 1) {
    const view = views[0]
    return view === undefined ? [] : formatDetails(sessionFrameFields(view))
  }

  const fields = views.map(sessionFrameFields)
  return [
    formatColumns([
      ["PROJECT", projectWidth],
      ["STATE", stateWidth],
      ["ACTIVITY"],
    ]),
    ...fields.map((field) =>
      formatColumns([
        [field.project, projectWidth],
        [field.state, stateWidth],
        [field.activity],
      ]),
    ),
    formatColumns([
      ["SESSION", sessionWidth],
      ["EVIDENCE", evidenceWidth],
      ["FRESHNESS"],
      ["PROVENANCE"],
    ]),
    ...fields.map((field) =>
      formatColumns([
        [field.session, sessionWidth],
        [field.evidence, evidenceWidth],
        [field.freshness],
        [field.provenance],
      ]),
    ),
    formatColumns([
      ["SOURCE UPDATED", sourceUpdatedWidth],
      ["OBSERVED"],
    ]),
    ...fields.map((field) =>
      formatColumns([
        [field.sourceUpdated, sourceUpdatedWidth],
        [field.observed],
      ]),
    ),
  ]
}

export const formatSessionView = (view: SessionView): ReadonlyArray<string> =>
  formatDetails(sessionFrameFields(view))

export const formatSessionEvent = (
  event: SessionEvent,
): ReadonlyArray<string> => {
  if (event._tag === "SessionsSnapshot" || event._tag === "SessionsUpdated") {
    return formatSessionViews(event.views)
  }

  return formatDetails({
    project: "-",
    state: "UNAVAILABLE",
    activity: "details unavailable",
    session: "-",
    evidence: "-",
    freshness: "-",
    provenance: "-",
    sourceUpdated: "-",
    observed: "-",
  })
}

export const runSessionClient = <E, R>(
  events: Stream.Stream<SessionEvent, E, R>,
  client: ClientPort,
): Effect.Effect<void, ClientOutputError | E, R> =>
  events.pipe(
    Stream.runForEach((event) =>
      client.writeFrame(formatSessionEvent(event)),
    ),
  )

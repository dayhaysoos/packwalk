import { Effect, Schema, Stream } from "effect"

import type { SessionEvent, SessionView } from "../domain/session.js"

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
const activityWidth = 24
const updatedWidth = 20

const escapeTerminalText = (value: string): string =>
  Array.from(value, (character) => {
    if (character === "\\") {
      return "\\\\"
    }
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
      ? `\\u${codePoint.toString(16).toUpperCase().padStart(4, "0")}`
      : character
  }).join("")

const fitColumn = (value: string, width: number): string => {
  const characters = Array.from(value)
  const fitted =
    characters.length <= width
      ? value
      : `${characters.slice(0, width - 3).join("")}...`
  return fitted.padEnd(width)
}

const formatRow = (
  project: string,
  state: string,
  activity: string,
  updated: string,
): string =>
  [
    fitColumn(project, projectWidth),
    fitColumn(state, stateWidth),
    fitColumn(activity, activityWidth),
    fitColumn(updated, updatedWidth).trimEnd(),
  ].join("  ")

const tableHeader = formatRow("PROJECT", "STATE", "ACTIVITY", "UPDATED")

const projectName = (identity: string): string => {
  const withoutTrailingSeparators = identity.replace(/[\\/]+$/u, "")
  if (withoutTrailingSeparators.length === 0) {
    return identity
  }
  return withoutTrailingSeparators.split(/[\\/]/u).at(-1) ?? identity
}

const compactUtc = (epochMs: number): string =>
  new Date(epochMs)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/u, "Z")

export const formatSessionView = (view: SessionView): ReadonlyArray<string> => [
  tableHeader,
  formatRow(
    escapeTerminalText(projectName(view.projectIdentity)),
    view.state._tag.toUpperCase(),
    view.activity,
    compactUtc(view.sourceUpdatedAtMs),
  ),
]

const formatEvent = (event: SessionEvent): ReadonlyArray<string> => {
  if (event._tag !== "SessionUnavailable") {
    return formatSessionView(event.view)
  }

  return [
    tableHeader,
    formatRow("-", "UNAVAILABLE", "details unavailable", "-"),
  ]
}

export const runSessionClient = <E, R>(
  events: Stream.Stream<SessionEvent, E, R>,
  client: ClientPort,
): Effect.Effect<void, ClientOutputError | E, R> =>
  events.pipe(
    Stream.runForEach((event) => client.writeFrame(formatEvent(event))),
  )

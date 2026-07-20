import { Data, Option, Result, Schema } from "effect"

export const MaximumIdentityBytes = 4 * 1024
export const MaximumSessionEventBytes = 64 * 1024

const identityEncoder = new TextEncoder()

export const Identity = Schema.NonEmptyString.check(
  Schema.makeFilter((identity) =>
    identityEncoder.encode(identity).byteLength <= MaximumIdentityBytes
      ? undefined
      : "identity exceeds PackWalk's UTF-8 size limit",
  ),
)

export const SessionIdentity = Identity.pipe(
  Schema.brand("PackWalk.SessionIdentity"),
)
export type SessionIdentity = typeof SessionIdentity.Type

export const ProjectIdentity = Identity.pipe(
  Schema.brand("PackWalk.ProjectIdentity"),
)
export type ProjectIdentity = typeof ProjectIdentity.Type

const MaximumDateTimestampMs = 8_640_000_000_000_000
export const DateTimestampMs = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(MaximumDateTimestampMs),
)
const PositiveSafeInteger = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(1),
)

export const CodexPersistedFact = Schema.Struct({
  version: Schema.Literal(1),
  sessionId: SessionIdentity,
  projectIdentity: ProjectIdentity,
  sourceUpdatedAtMs: DateTimestampMs,
})

export interface CodexPersistedFact extends Schema.Schema.Type<typeof CodexPersistedFact> {}

export const SessionState = Schema.TaggedUnion({
  Discovered: {},
  Polled: {},
})

export type SessionState = typeof SessionState.Type

export const SessionView = Schema.Struct({
  protocolVersion: Schema.Literal(1),
  sessionId: SessionIdentity,
  projectIdentity: ProjectIdentity,
  activity: Schema.Literal("persisted Codex activity"),
  evidenceSource: Schema.Literal("codex-sqlite-thread-index"),
  state: SessionState,
  freshness: Schema.Literal("fresh"),
  sourceUpdatedAtMs: DateTimestampMs,
  observedAtMs: DateTimestampMs,
  commitSequence: PositiveSafeInteger,
})

export interface SessionView extends Schema.Schema.Type<typeof SessionView> {}

const sourceUnavailableMessage =
  "PackWalk could not read supported Codex persisted evidence" as const
const storageUnavailableMessage =
  "PackWalk could not commit its current session view" as const

export const SessionEvent = Schema.TaggedUnion({
  SessionSnapshot: {
    protocolVersion: Schema.Literal(1),
    view: SessionView,
  },
  SessionUpdated: {
    protocolVersion: Schema.Literal(1),
    view: SessionView,
  },
  SessionUnavailable: {
    protocolVersion: Schema.Literal(1),
    code: Schema.Literals([
      "source-incompatible",
      "source-unavailable",
      "storage-unavailable",
    ]),
    message: Schema.Literals([
      sourceUnavailableMessage,
      storageUnavailableMessage,
    ]),
  },
}).check(
  Schema.makeFilter((event) => {
    if (event._tag !== "SessionUnavailable") {
      return undefined
    }

    const valid =
      event.code === "storage-unavailable"
        ? event.message === storageUnavailableMessage
        : event.message === sourceUnavailableMessage

    return valid
      ? undefined
      : "session unavailable code and message must describe the same failure"
  }),
)

export type SessionEvent = typeof SessionEvent.Type

export class IllegalSessionTransition extends Schema.TaggedErrorClass<IllegalSessionTransition>()(
  "PackWalk.IllegalSessionTransition",
  {
    reason: Schema.Literals(["session-identity-changed", "source-time-regressed"]),
  },
) {}

export type SessionTransitionSource = "discovery" | "poll"

type TransitionDecision = Data.TaggedEnum<{
  NoChange: {}
  Changed: {
    readonly event: SessionEvent
    readonly view: SessionView
  }
}>

const TransitionDecision = Data.taggedEnum<TransitionDecision>()

export const transitionSession = (
  current: Option.Option<SessionView>,
  fact: CodexPersistedFact,
  observedAtMs: number,
  source: SessionTransitionSource = "poll",
): Result.Result<TransitionDecision, IllegalSessionTransition> => {
  if (Option.isNone(current)) {
    const view = SessionView.make({
      protocolVersion: 1,
      sessionId: fact.sessionId,
      projectIdentity: fact.projectIdentity,
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: SessionState.cases.Discovered.make({}),
      freshness: "fresh",
      sourceUpdatedAtMs: fact.sourceUpdatedAtMs,
      observedAtMs,
      commitSequence: 1,
    })

    return Result.succeed(
      TransitionDecision.Changed({
        view,
        event: SessionEvent.cases.SessionSnapshot.make({ protocolVersion: 1, view }),
      }),
    )
  }

  if (
    current.value.sessionId !== fact.sessionId &&
    source === "poll"
  ) {
    return Result.fail(new IllegalSessionTransition({ reason: "session-identity-changed" }))
  }

  if (current.value.sessionId !== fact.sessionId) {
    const view = SessionView.make({
      protocolVersion: 1,
      sessionId: fact.sessionId,
      projectIdentity: fact.projectIdentity,
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: SessionState.cases.Discovered.make({}),
      freshness: "fresh",
      sourceUpdatedAtMs: fact.sourceUpdatedAtMs,
      observedAtMs,
      commitSequence: current.value.commitSequence + 1,
    })

    return Result.succeed(
      TransitionDecision.Changed({
        view,
        event: SessionEvent.cases.SessionUpdated.make({
          protocolVersion: 1,
          view,
        }),
      }),
    )
  }

  if (fact.sourceUpdatedAtMs < current.value.sourceUpdatedAtMs) {
    return Result.fail(new IllegalSessionTransition({ reason: "source-time-regressed" }))
  }

  if (
    (source === "discovery" || current.value.state._tag === "Polled") &&
    fact.sourceUpdatedAtMs === current.value.sourceUpdatedAtMs
  ) {
    return Result.succeed(TransitionDecision.NoChange())
  }

  const view = SessionView.make({
    ...current.value,
    state: SessionState.cases.Polled.make({}),
    sourceUpdatedAtMs: fact.sourceUpdatedAtMs,
    observedAtMs,
    commitSequence: current.value.commitSequence + 1,
  })

  return Result.succeed(
    TransitionDecision.Changed({
      view,
      event: SessionEvent.cases.SessionUpdated.make({ protocolVersion: 1, view }),
    }),
  )
}

export const matchTransition = TransitionDecision.$match

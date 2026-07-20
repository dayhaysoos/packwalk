import { Data, Option, Result, Schema, SchemaTransformation } from "effect"

export const MaximumIdentityBytes = 4 * 1024
export const MaximumSessionEventBytes = 4 * 1024 * 1024

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

export const sameSessionIdentity = (left: string, right: string): boolean =>
  left === right

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
const NonNegativeSafeInteger = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
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

export const SessionRetentionReason = Schema.Literals([
  "source-unavailable",
  "source-unsupported",
])

export type SessionRetentionReason = typeof SessionRetentionReason.Type

export const SessionProvenance = Schema.TaggedUnion({
  Observed: {},
  Retained: {
    reason: SessionRetentionReason,
  },
})

export type SessionProvenance = typeof SessionProvenance.Type

interface SessionViewConsistencyInput {
  readonly freshness: "fresh" | "stale"
  readonly provenance: SessionProvenance
}

const SessionViewConsistency =
  Schema.makeFilter<SessionViewConsistencyInput>((view) =>
    (view.provenance._tag === "Observed" && view.freshness === "fresh") ||
      (view.provenance._tag === "Retained" && view.freshness === "stale")
      ? undefined
      : "session freshness and provenance must describe the same evidence",
  )

export const SessionView = Schema.Struct({
  protocolVersion: Schema.Literal(2),
  sessionId: SessionIdentity,
  projectIdentity: ProjectIdentity,
  activity: Schema.Literal("persisted Codex activity"),
  evidenceSource: Schema.Literal("codex-sqlite-thread-index"),
  state: SessionState,
  freshness: Schema.Literals(["fresh", "stale"]),
  provenance: SessionProvenance,
  sourceUpdatedAtMs: DateTimestampMs,
  observedAtMs: DateTimestampMs,
  commitSequence: PositiveSafeInteger,
}).check(SessionViewConsistency)

export interface SessionView extends Schema.Schema.Type<typeof SessionView> {}

export const SessionViews = Schema.NonEmptyArray(SessionView).check(
  Schema.makeFilter((views) => {
    const identities = new Set<string>()
    const commitSequences = new Set<number>()

    for (const view of views) {
      if (identities.has(view.sessionId)) {
        return "session views must have unique exact session identities"
      }
      if (commitSequences.has(view.commitSequence)) {
        return "session views must have unique commit identities"
      }
      identities.add(view.sessionId)
      commitSequences.add(view.commitSequence)
    }

    return undefined
  }),
)

export type SessionViews = typeof SessionViews.Type

const ChangedSessionIdentities = Schema.Array(SessionIdentity).check(
  Schema.makeFilter((identities) => {
    const exactIdentities = new Set<string>()

    for (const identity of identities) {
      if (exactIdentities.has(identity)) {
        return "changed session identities must be unique"
      }
      exactIdentities.add(identity)
    }

    return undefined
  }),
)

const sourceUnavailableMessage =
  "PackWalk could not read supported Codex persisted evidence" as const
const sourceAmbiguousMessage =
  "PackWalk found ambiguous Codex persisted evidence" as const
const storageUnavailableMessage =
  "PackWalk could not commit its current session view" as const
const overviewUnavailableMessage =
  "PackWalk could not publish its current session overview" as const

const SessionsSnapshotFields = {
  protocolVersion: Schema.Literal(4),
  views: SessionViews,
} as const

const SessionsUpdatedFields = {
  protocolVersion: Schema.Literal(4),
  views: SessionViews,
  changedSessionIds: ChangedSessionIdentities,
} as const

const SessionUnavailableCode = Schema.Literals([
  "source-ambiguous",
  "source-incompatible",
  "source-unavailable",
  "storage-unavailable",
  "overview-unavailable",
])

const SessionUnavailableMessage = Schema.Literals([
  sourceAmbiguousMessage,
  sourceUnavailableMessage,
  storageUnavailableMessage,
  overviewUnavailableMessage,
])

interface SessionEventConsistencyInput {
  readonly _tag: string
  readonly protocolVersion: 4
  readonly views?: ReadonlyArray<SessionView>
  readonly changedSessionIds?: ReadonlyArray<SessionIdentity>
  readonly code?: typeof SessionUnavailableCode.Type
  readonly message?: typeof SessionUnavailableMessage.Type
}

const SessionEventConsistency = Schema.makeFilter<SessionEventConsistencyInput>(
  (event) => {
    if (event._tag === "SessionsUpdated") {
      const changedSessionIds = event.changedSessionIds ?? []
      if (changedSessionIds.length === 0) {
        return "updated session overviews must name at least one changed session"
      }

      const viewIdentities = new Set(
        (event.views ?? []).map((view) => view.sessionId as string),
      )
      return changedSessionIds.every((identity) =>
          viewIdentities.has(identity)
        )
        ? undefined
        : "changed session identities must belong to the overview"
    }

    if (event._tag !== "SessionUnavailable") {
      return undefined
    }

    const valid =
      event.code === "storage-unavailable"
        ? event.message === storageUnavailableMessage
        : event.code === "overview-unavailable"
          ? event.message === overviewUnavailableMessage
        : event.code === "source-ambiguous"
          ? event.message === sourceAmbiguousMessage
          : event.message === sourceUnavailableMessage

    return valid
      ? undefined
      : "session unavailable code and message must describe the same failure"
  },
)

export const SessionProtocolEvent = Schema.TaggedUnion({
  SessionsSnapshot: SessionsSnapshotFields,
  SessionsUpdated: SessionsUpdatedFields,
  SessionUnavailable: {
    protocolVersion: Schema.Literal(4),
    code: SessionUnavailableCode,
    message: SessionUnavailableMessage,
  },
}).check(SessionEventConsistency)

export type SessionProtocolEvent = typeof SessionProtocolEvent.Type

export const SessionEvent = SessionProtocolEvent
export type SessionEvent = SessionProtocolEvent

const SessionProtocolEventJsonString = Schema.String.check(
  Schema.makeFilter((encoded) =>
    identityEncoder.encode(encoded).byteLength <= MaximumSessionEventBytes
      ? undefined
      : "session event exceeds PackWalk's UTF-8 frame limit",
  ),
)

const SessionProtocolEventJsonValue = SessionProtocolEventJsonString.pipe(
  Schema.decodeTo(
    Schema.Unknown,
    SchemaTransformation.fromJsonString,
  ),
)

export const SessionProtocolEventJson = SessionProtocolEventJsonValue.pipe(
  Schema.decodeTo(SessionProtocolEvent),
)

export const encodeSessionProtocolEvent = Schema.encodeEffect(
  SessionProtocolEventJson,
)

export const SessionEvidenceOrigin = Schema.TaggedUnion({
  Committed: {
    recordedAtMs: DateTimestampMs,
  },
  MigratedBaseline: {},
})

export type SessionEvidenceOrigin = typeof SessionEvidenceOrigin.Type

export const SessionEvidenceFact = Schema.Struct({
  factVersion: Schema.Literal(1),
  origin: SessionEvidenceOrigin,
  view: SessionView,
})

export interface SessionEvidenceFact extends Schema.Schema.Type<typeof SessionEvidenceFact> {}

export const SessionHistoryCoverage = Schema.Literals([
  "complete",
  "prior-history-unavailable",
])

export type SessionHistoryCoverage = typeof SessionHistoryCoverage.Type

export const sessionHistoryOmittedContent = [
  "prompts",
  "responses",
  "tool-output",
  "command-output",
  "diff-content",
  "terminal-input",
  "raw-codex-payloads",
  "raw-ipc-bodies",
] as const

export const SessionHistoryOmittedContent = Schema.Tuple([
  Schema.Literal("prompts"),
  Schema.Literal("responses"),
  Schema.Literal("tool-output"),
  Schema.Literal("command-output"),
  Schema.Literal("diff-content"),
  Schema.Literal("terminal-input"),
  Schema.Literal("raw-codex-payloads"),
  Schema.Literal("raw-ipc-bodies"),
])

export const sessionHistoryUnsupportedFacts = [
  "live-observation",
  "attention",
] as const

export const SessionHistoryUnsupportedFacts = Schema.Tuple([
  Schema.Literal("live-observation"),
  Schema.Literal("attention"),
])

export const SessionHistoryCursor = Schema.Struct({
  afterCommitSequence: NonNegativeSafeInteger,
  throughCommitSequence: PositiveSafeInteger,
}).check(
  Schema.makeFilter((cursor) =>
    cursor.afterCommitSequence < cursor.throughCommitSequence
      ? undefined
      : "history cursor must advance toward its fixed snapshot",
  ),
)

export interface SessionHistoryCursor extends Schema.Schema.Type<typeof SessionHistoryCursor> {}

export const sameSessionView = (left: SessionView, right: SessionView): boolean =>
  left.protocolVersion === right.protocolVersion &&
  sameSessionIdentity(left.sessionId, right.sessionId) &&
  left.projectIdentity === right.projectIdentity &&
  left.activity === right.activity &&
  left.evidenceSource === right.evidenceSource &&
  left.state._tag === right.state._tag &&
  left.freshness === right.freshness &&
  left.provenance._tag === right.provenance._tag &&
  (left.provenance._tag === "Observed" ||
    (right.provenance._tag === "Retained" &&
      left.provenance.reason === right.provenance.reason)) &&
  left.sourceUpdatedAtMs === right.sourceUpdatedAtMs &&
  left.observedAtMs === right.observedAtMs &&
  left.commitSequence === right.commitSequence

interface SessionHistoryFactsConsistencyInput {
  readonly sessionId: SessionIdentity
  readonly explainedView: SessionView
  readonly facts: ReadonlyArray<SessionEvidenceFact>
}

const SessionHistoryFactsConsistency = Schema.makeFilter<SessionHistoryFactsConsistencyInput>(
  (history) => {
    if (!sameSessionIdentity(history.sessionId, history.explainedView.sessionId)) {
      return "history must explain the requested exact session"
    }

    let previousCommitSequence = 0
    for (const fact of history.facts) {
      if (!sameSessionIdentity(history.sessionId, fact.view.sessionId)) {
        return "history facts must belong to the requested exact session"
      }
      if (fact.view.commitSequence <= previousCommitSequence) {
        return "history facts must follow PackWalk commit order"
      }
      previousCommitSequence = fact.view.commitSequence
    }

    return undefined
  },
)

interface SessionHistoryConsistencyInput extends SessionHistoryFactsConsistencyInput {
  readonly historyCoverage: SessionHistoryCoverage
}

const SessionHistoryConsistency = Schema.makeFilter<SessionHistoryConsistencyInput>(
  (history) => {
    const migratedBaselines = history.facts.filter(
      (fact) => fact.origin._tag === "MigratedBaseline",
    )
    if (
      migratedBaselines.length > 0 &&
      history.facts[0]?.origin._tag !== "MigratedBaseline"
    ) {
      return "a migrated history baseline must be the first retained fact"
    }

    const latest = history.facts.at(-1)
    if (latest === undefined || !sameSessionView(latest.view, history.explainedView)) {
      return "the latest history fact must equal the explained current view"
    }

    return history.historyCoverage === "complete"
      ? migratedBaselines.length === 0
        ? undefined
        : "complete history cannot contain a migrated baseline"
      : migratedBaselines.length === 1
        ? undefined
        : "unavailable prior history requires one migrated baseline"
  },
)

const SessionHistoryFields = {
  protocolVersion: Schema.Literal(4),
  sessionId: SessionIdentity,
  explainedView: SessionView,
  historyCoverage: SessionHistoryCoverage,
  omittedContent: SessionHistoryOmittedContent,
  unsupportedFacts: SessionHistoryUnsupportedFacts,
  facts: Schema.NonEmptyArray(SessionEvidenceFact),
} as const

export const SessionHistory = Schema.TaggedStruct(
  "SessionHistory",
  SessionHistoryFields,
).check(SessionHistoryFactsConsistency, SessionHistoryConsistency)

export type SessionHistory = typeof SessionHistory.Type

const SessionHistoryPageFields = {
  ...SessionHistoryFields,
  afterCommitSequence: NonNegativeSafeInteger,
  throughCommitSequence: PositiveSafeInteger,
  nextAfterCommitSequence: Schema.NullOr(PositiveSafeInteger),
} as const

interface SessionHistoryPageConsistencyInput extends SessionHistoryConsistencyInput {
  readonly afterCommitSequence: number
  readonly throughCommitSequence: number
  readonly nextAfterCommitSequence: number | null
}

const SessionHistoryPageConsistency = Schema.makeFilter<SessionHistoryPageConsistencyInput>(
  (page) => {
    const first = page.facts[0]
    const last = page.facts.at(-1)
    if (
      first === undefined ||
      last === undefined ||
      first.view.commitSequence <= page.afterCommitSequence ||
      last.view.commitSequence > page.throughCommitSequence ||
      page.explainedView.commitSequence !== page.throughCommitSequence
    ) {
      return "history page must remain within its fixed commit snapshot"
    }
    const migratedBaselines = page.facts.filter(
      (fact) => fact.origin._tag === "MigratedBaseline",
    )
    if (page.afterCommitSequence === 0) {
      const validCoverage = page.historyCoverage === "complete"
        ? migratedBaselines.length === 0
        : migratedBaselines.length === 1 &&
          page.facts[0]?.origin._tag === "MigratedBaseline"
      if (!validCoverage) {
        return "the first history page must truthfully describe prior coverage"
      }
    } else if (migratedBaselines.length > 0) {
      return "continuation history pages cannot repeat a migrated baseline"
    }

    if (page.nextAfterCommitSequence === null) {
      return sameSessionView(last.view, page.explainedView)
        ? undefined
        : "the final history page must reach the explained current view"
    }

    return page.nextAfterCommitSequence === last.view.commitSequence &&
        page.nextAfterCommitSequence < page.throughCommitSequence
      ? undefined
      : "history continuation must follow the final returned fact"
  },
)

export const SessionHistoryPage = Schema.TaggedStruct(
  "SessionHistoryPage",
  SessionHistoryPageFields,
).check(SessionHistoryFactsConsistency, SessionHistoryPageConsistency)

export type SessionHistoryPage = typeof SessionHistoryPage.Type

const sessionHistoryNotFoundMessage =
  "PackWalk has no retained history for that exact session" as const
const sessionHistoryUnavailableMessage =
  "PackWalk could not read its retained session history" as const
const sessionHistoryCursorMessage =
  "PackWalk could not continue that retained session history query" as const

const SessionHistoryUnavailableCode = Schema.Literals([
  "session-not-found",
  "history-unavailable",
  "invalid-history-cursor",
])

const SessionHistoryUnavailableMessage = Schema.Literals([
  sessionHistoryNotFoundMessage,
  sessionHistoryUnavailableMessage,
  sessionHistoryCursorMessage,
])

const SessionHistoryUnavailableConsistency = Schema.makeFilter<{
  readonly code: typeof SessionHistoryUnavailableCode.Type
  readonly message: typeof SessionHistoryUnavailableMessage.Type
}>((result) => {
  const valid =
    result.code === "session-not-found"
      ? result.message === sessionHistoryNotFoundMessage
      : result.code === "invalid-history-cursor"
        ? result.message === sessionHistoryCursorMessage
        : result.message === sessionHistoryUnavailableMessage
  return valid
    ? undefined
    : "history unavailable code and message must describe the same failure"
})

export const SessionHistoryUnavailable = Schema.TaggedStruct(
  "SessionHistoryUnavailable",
  {
    protocolVersion: Schema.Literal(4),
    sessionId: SessionIdentity,
    code: SessionHistoryUnavailableCode,
    message: SessionHistoryUnavailableMessage,
  },
).check(SessionHistoryUnavailableConsistency)

export type SessionHistoryUnavailable = typeof SessionHistoryUnavailable.Type

export const SessionHistoryResult = Schema.Union([
  SessionHistory,
  SessionHistoryUnavailable,
])

export type SessionHistoryResult = typeof SessionHistoryResult.Type

export const SessionHistoryProtocolResponse = Schema.Union([
  SessionHistoryPage,
  SessionHistoryUnavailable,
])

export type SessionHistoryProtocolResponse = typeof SessionHistoryProtocolResponse.Type

const SessionHistoryProtocolResponseJsonString = Schema.String.check(
  Schema.makeFilter((encoded) =>
    identityEncoder.encode(encoded).byteLength <= MaximumSessionEventBytes
      ? undefined
      : "session history response exceeds PackWalk's UTF-8 frame limit",
  ),
)

const SessionHistoryProtocolResponseJsonValue =
  SessionHistoryProtocolResponseJsonString.pipe(
    Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString),
  )

export const SessionHistoryProtocolResponseJson =
  SessionHistoryProtocolResponseJsonValue.pipe(
    Schema.decodeTo(SessionHistoryProtocolResponse),
  )

export const encodeSessionHistoryProtocolResponse = Schema.encodeEffect(
  SessionHistoryProtocolResponseJson,
)

export class IllegalSessionTransition extends Schema.TaggedErrorClass<IllegalSessionTransition>()(
  "PackWalk.IllegalSessionTransition",
  {
    reason: Schema.Literals(["session-identity-changed", "source-time-regressed"]),
  },
) {}

export type SessionTransitionTrigger = Data.TaggedEnum<{
  Discovery: {}
  Polling: {}
}>

export const SessionTransitionTrigger =
  Data.taggedEnum<SessionTransitionTrigger>()

export const matchSessionTransitionTrigger =
  SessionTransitionTrigger.$match

type TransitionDecision = Data.TaggedEnum<{
  NoChange: {}
  Changed: {
    readonly view: SessionView
  }
}>

const TransitionDecision = Data.taggedEnum<TransitionDecision>()

const makeDiscoveredSessionView = (
  fact: CodexPersistedFact,
  observedAtMs: number,
  commitSequence: number,
): SessionView =>
  SessionView.make({
    protocolVersion: 2,
    sessionId: fact.sessionId,
    projectIdentity: fact.projectIdentity,
    activity: "persisted Codex activity",
    evidenceSource: "codex-sqlite-thread-index",
    state: SessionState.cases.Discovered.make({}),
    freshness: "fresh",
    provenance: SessionProvenance.cases.Observed.make({}),
    sourceUpdatedAtMs: fact.sourceUpdatedAtMs,
    observedAtMs,
    commitSequence,
  })

export const transitionSession = (
  current: Option.Option<SessionView>,
  fact: CodexPersistedFact,
  observedAtMs: number,
  trigger: SessionTransitionTrigger = SessionTransitionTrigger.Polling(),
  commitSequence?: number,
): Result.Result<TransitionDecision, IllegalSessionTransition> => {
  if (Option.isNone(current)) {
    const view = makeDiscoveredSessionView(
      fact,
      observedAtMs,
      commitSequence ?? 1,
    )

    return Result.succeed(TransitionDecision.Changed({ view }))
  }

  if (!sameSessionIdentity(current.value.sessionId, fact.sessionId)) {
    return Result.fail(
      new IllegalSessionTransition({
        reason: "session-identity-changed",
      }),
    )
  }

  if (fact.sourceUpdatedAtMs < current.value.sourceUpdatedAtMs) {
    return Result.fail(new IllegalSessionTransition({ reason: "source-time-regressed" }))
  }

  const unchangedEvidenceIsNoChange = matchSessionTransitionTrigger(trigger, {
    Discovery: () => current.value.provenance._tag === "Observed",
    Polling: () =>
      current.value.state._tag === "Polled" &&
      current.value.provenance._tag === "Observed",
  })
  if (
    unchangedEvidenceIsNoChange &&
    fact.sourceUpdatedAtMs === current.value.sourceUpdatedAtMs
  ) {
    return Result.succeed(TransitionDecision.NoChange())
  }

  const view = SessionView.make({
    ...current.value,
    state: SessionState.cases.Polled.make({}),
    freshness: "fresh",
    provenance: SessionProvenance.cases.Observed.make({}),
    sourceUpdatedAtMs: fact.sourceUpdatedAtMs,
    observedAtMs,
    commitSequence: commitSequence ?? current.value.commitSequence + 1,
  })

  return Result.succeed(TransitionDecision.Changed({ view }))
}

export const degradeSession = (
  current: SessionView,
  reason: SessionRetentionReason,
  commitSequence: number = current.commitSequence + 1,
): TransitionDecision => {
  if (
    current.provenance._tag === "Retained" &&
    (current.provenance.reason === reason ||
      current.provenance.reason === "source-unsupported")
  ) {
    return TransitionDecision.NoChange()
  }

  return TransitionDecision.Changed({
    view: SessionView.make({
      ...current,
      freshness: "stale",
      provenance: SessionProvenance.cases.Retained.make({ reason }),
      commitSequence,
    }),
  })
}

export const matchTransition = TransitionDecision.$match

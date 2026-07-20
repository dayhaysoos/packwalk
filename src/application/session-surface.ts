import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  PubSub,
  Ref,
  Result,
  Schedule,
  Semaphore,
  Stream,
} from "effect"

import {
  Service as SessionSource,
  SessionSourceError,
} from "./session-source.js"
import {
  Service as SessionStorage,
  type SessionStorageSnapshot,
} from "./session-storage.js"
import {
  degradeSession,
  encodeSessionProtocolEvent,
  matchTransition,
  sameSessionIdentity,
  SessionHistoryPage,
  SessionHistoryUnavailable,
  sessionHistoryOmittedContent,
  sessionHistoryUnsupportedFacts,
  SessionProtocolEvent,
  SessionTransitionTrigger,
  type CodexPersistedFact,
  type SessionHistoryCursor,
  type SessionHistoryProtocolResponse,
  type SessionIdentity,
  type SessionRetentionReason,
  type SessionView,
  transitionSession,
} from "../domain/session.js"

export interface Interface {
  readonly events: Stream.Stream<SessionProtocolEvent>
  readonly inspectHistoryPage: (
    sessionId: SessionIdentity,
    cursor: SessionHistoryCursor | null,
  ) => Effect.Effect<SessionHistoryProtocolResponse>
  readonly refresh: () => Effect.Effect<void>
  readonly runPolling: Effect.Effect<never>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionSurface",
) {}

interface SessionEventEnvelope {
  readonly revision: number
  readonly event: SessionProtocolEvent
}

type NonEmptyReadonlyArray<A> = readonly [A, ...Array<A>]

interface ObservationDecision {
  readonly views: NonEmptyReadonlyArray<SessionView>
  readonly changedViews: ReadonlyArray<SessionView>
  readonly changedSessionIds: ReadonlyArray<SessionIdentity>
  readonly lastCommitSequence: number
  readonly recordedAtMs: number
}

interface FinalizedObservation {
  readonly event: SessionProtocolEvent
  readonly snapshot: SessionStorageSnapshot
  readonly publish: boolean
}

interface ExactPollOutcome {
  readonly view: SessionView
  readonly result: Result.Result<CodexPersistedFact, SessionSourceError>
}

type SessionTransitionDecision = ReturnType<typeof degradeSession>

interface ObservationAccumulator {
  readonly nextByIdentity: Map<SessionIdentity, SessionView>
  readonly changedViews: Array<SessionView>
  readonly changedSessionIds: Array<SessionIdentity>
  lastCommitSequence: number
}

const sourceUnavailableEvent = (
  code:
    | "source-incompatible"
    | "source-unavailable"
    | "source-ambiguous",
): SessionProtocolEvent =>
  code === "source-ambiguous"
    ? SessionProtocolEvent.cases.SessionUnavailable.make({
        protocolVersion: 4,
        code,
        message: "PackWalk found ambiguous Codex persisted evidence",
      })
    : SessionProtocolEvent.cases.SessionUnavailable.make({
        protocolVersion: 4,
        code,
        message: "PackWalk could not read supported Codex persisted evidence",
      })

const storageUnavailableEvent = (): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionUnavailable.make({
    protocolVersion: 4,
    code: "storage-unavailable",
    message: "PackWalk could not commit its current session view",
  })

const overviewUnavailableEvent = (): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionUnavailable.make({
    protocolVersion: 4,
    code: "overview-unavailable",
    message: "PackWalk could not publish its current session overview",
  })

const sourceErrorEvent = (error: SessionSourceError): SessionProtocolEvent => {
  switch (error.code) {
    case "unavailable":
      return sourceUnavailableEvent("source-unavailable")
    case "ambiguous":
      return sourceUnavailableEvent("source-ambiguous")
    case "invalid-evidence":
    case "unsupported":
      return sourceUnavailableEvent("source-incompatible")
  }
}

const asCurrentSnapshot = (
  event: SessionProtocolEvent,
): SessionProtocolEvent => {
  switch (event._tag) {
    case "SessionsUpdated":
      return SessionProtocolEvent.cases.SessionsSnapshot.make({
        protocolVersion: 4,
        views: event.views,
      })
    case "SessionsSnapshot":
    case "SessionUnavailable":
      return event
  }
}

const publicEvents = (
  current: Ref.Ref<SessionEventEnvelope>,
  updates: PubSub.PubSub<SessionEventEnvelope>,
) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const subscription = yield* PubSub.subscribe(updates)
      const initial = yield* Ref.get(current)

      return Stream.concat(
        Stream.make(asCurrentSnapshot(initial.event)),
        Stream.fromEffect(PubSub.take(subscription)).pipe(
          Stream.repeat(Schedule.forever),
          Stream.filter((envelope) => envelope.revision > initial.revision),
          Stream.map((envelope) => envelope.event),
        ),
      )
    }),
  )

const makeEventState = Effect.fn("SessionSurface.makeEventState")(
  function* (
    initialEvent: SessionProtocolEvent,
    initialSnapshot: SessionStorageSnapshot,
  ) {
    const current = yield* Ref.make<SessionEventEnvelope>({
      revision: 0,
      event: initialEvent,
    })
    const committed = yield* Ref.make(initialSnapshot)
    const updates = yield* Effect.acquireRelease(
      PubSub.sliding<SessionEventEnvelope>(1),
      PubSub.shutdown,
    )
    const publish = Effect.fn("SessionSurface.publish")(function* (
      event: SessionProtocolEvent,
      nextSnapshot?: SessionStorageSnapshot,
    ) {
      if (nextSnapshot !== undefined) {
        yield* Ref.set(committed, nextSnapshot)
      }
      const envelope = yield* Ref.modify(current, (previous) => {
        const next = {
          revision: previous.revision + 1,
          event,
        } satisfies SessionEventEnvelope
        return [next, next] as const
      })
      yield* PubSub.publish(updates, envelope)
    }, Effect.uninterruptible)

    return {
      committed: Ref.get(committed),
      currentEvent: Ref.get(current).pipe(
        Effect.map((envelope) => envelope.event),
      ),
      events: publicEvents(current, updates),
      publish,
    }
  },
)

const exactIdentityOrder = (
  left: { readonly sessionId: SessionIdentity },
  right: { readonly sessionId: SessionIdentity },
): number =>
  left.sessionId < right.sessionId
    ? -1
    : left.sessionId > right.sessionId
      ? 1
      : 0

const makeObservationAccumulator = (
  current: SessionStorageSnapshot,
): ObservationAccumulator => ({
  nextByIdentity: new Map(
    current.views.map((view) => [view.sessionId, view] as const),
  ),
  changedViews: [],
  changedSessionIds: [],
  lastCommitSequence: current.lastCommitSequence,
})

const recordSessionTransition = (
  accumulator: ObservationAccumulator,
  transition: SessionTransitionDecision,
): void =>
  matchTransition(transition, {
    NoChange: () => undefined,
    Changed: ({ view }) => {
      accumulator.lastCommitSequence = view.commitSequence
      accumulator.nextByIdentity.set(view.sessionId, view)
      accumulator.changedViews.push(view)
      accumulator.changedSessionIds.push(view.sessionId)
    },
  })

const completeObservation = Effect.fn("SessionSurface.completeObservation")(
  function* (accumulator: ObservationAccumulator, recordedAtMs: number) {
    const orderedViews = Array.from(accumulator.nextByIdentity.values()).sort(
      exactIdentityOrder,
    )
    const firstView = orderedViews[0]
    if (firstView === undefined) {
      return yield* new SessionSourceError({
        code: "unavailable",
        message: "Codex persisted evidence is unavailable",
      })
    }

    return {
      views: [firstView, ...orderedViews.slice(1)],
      changedViews: accumulator.changedViews,
      changedSessionIds: accumulator.changedSessionIds,
      lastCommitSequence: accumulator.lastCommitSequence,
      recordedAtMs,
    } satisfies ObservationDecision
  },
)

const validateFacts = (
  facts: ReadonlyArray<CodexPersistedFact>,
): Effect.Effect<NonEmptyReadonlyArray<CodexPersistedFact>, SessionSourceError> =>
  Effect.gen(function* () {
    const first = facts[0]
    if (first === undefined) {
      return yield* new SessionSourceError({
        code: "unavailable",
        message: "Codex persisted evidence is unavailable",
      })
    }

    const seen = new Set<string>()
    for (const fact of facts) {
      if (seen.has(fact.sessionId)) {
        return yield* new SessionSourceError({
          code: "ambiguous",
          message: "Codex persisted evidence is ambiguous",
        })
      }
      seen.add(fact.sessionId)
    }

    const ordered = [first, ...facts.slice(1)].sort(exactIdentityOrder)
    const orderedFirst = ordered[0]
    if (orderedFirst === undefined) {
      return yield* new SessionSourceError({
        code: "unavailable",
        message: "Codex persisted evidence is unavailable",
      })
    }
    return [orderedFirst, ...ordered.slice(1)]
  })

const reduceDiscovery = Effect.fn("SessionSurface.reduceDiscovery")(
  function* (
    current: SessionStorageSnapshot,
    sourceFacts: ReadonlyArray<CodexPersistedFact>,
    observedAtMs: number,
  ) {
    const facts = yield* validateFacts(sourceFacts)
    const accumulator = makeObservationAccumulator(current)
    const discoveredIdentities = new Set(
      facts.map((fact) => fact.sessionId),
    )

    for (const fact of facts) {
      const currentView = accumulator.nextByIdentity.get(fact.sessionId)
      const decision = transitionSession(
        currentView === undefined ? Option.none() : Option.some(currentView),
        fact,
        observedAtMs,
        SessionTransitionTrigger.Discovery(),
        accumulator.lastCommitSequence + 1,
      )
      if (Result.isFailure(decision)) {
        if (currentView === undefined) {
          return yield* new SessionSourceError({
            code: "invalid-evidence",
            message: "Codex persisted evidence is incompatible",
          })
        }
        recordSessionTransition(
          accumulator,
          degradeSession(
            currentView,
            "source-unsupported",
            accumulator.lastCommitSequence + 1,
          ),
        )
        continue
      }

      recordSessionTransition(accumulator, decision.success)
    }

    for (const currentView of current.views) {
      if (discoveredIdentities.has(currentView.sessionId)) continue
      recordSessionTransition(
        accumulator,
        degradeSession(
          currentView,
          "source-unavailable",
          accumulator.lastCommitSequence + 1,
        ),
      )
    }

    return yield* completeObservation(accumulator, observedAtMs)
  },
)

const retentionReason = (
  error: SessionSourceError,
): SessionRetentionReason =>
  error.code === "unavailable"
    ? "source-unavailable"
    : "source-unsupported"

const reducePolling = Effect.fn("SessionSurface.reducePolling")(
  function* (
    current: SessionStorageSnapshot,
    outcomes: ReadonlyArray<ExactPollOutcome>,
    observedAtMs: number,
  ) {
    const accumulator = makeObservationAccumulator(current)

    for (const outcome of outcomes) {
      const transition = Result.isFailure(outcome.result)
        ? degradeSession(
            outcome.view,
            retentionReason(outcome.result.failure),
            accumulator.lastCommitSequence + 1,
          )
        : (() => {
            const observed = transitionSession(
              Option.some(outcome.view),
              outcome.result.success,
              observedAtMs,
              SessionTransitionTrigger.Polling(),
              accumulator.lastCommitSequence + 1,
            )
            return Result.isFailure(observed)
              ? degradeSession(
                  outcome.view,
                  "source-unsupported",
                  accumulator.lastCommitSequence + 1,
                )
              : observed.success
          })()

      recordSessionTransition(accumulator, transition)
    }

    return yield* completeObservation(accumulator, observedAtMs)
  },
)

const snapshotEvent = (
  views: NonEmptyReadonlyArray<SessionView>,
): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionsSnapshot.make({
    protocolVersion: 4,
    views,
  })

const updatedEvent = (
  decision: ObservationDecision,
): SessionProtocolEvent => {
  const firstChanged = decision.changedSessionIds[0]
  if (firstChanged === undefined) return snapshotEvent(decision.views)

  return SessionProtocolEvent.cases.SessionsUpdated.make({
    protocolVersion: 4,
    views: decision.views,
    changedSessionIds: [
      firstChanged,
      ...decision.changedSessionIds.slice(1),
    ],
  })
}

const ensurePublishableEvent = Effect.fn(
  "SessionSurface.ensurePublishableEvent",
)(function* (event: SessionProtocolEvent) {
  yield* encodeSessionProtocolEvent(event)
  return event
})

const selectPublishableEvent = Effect.fn(
  "SessionSurface.selectPublishableEvent",
)(function* (decision: ObservationDecision) {
  const updatedResult = yield* ensurePublishableEvent(
    updatedEvent(decision),
  ).pipe(Effect.result)
  if (!Result.isFailure(updatedResult)) return updatedResult.success

  return yield* ensurePublishableEvent(snapshotEvent(decision.views))
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const source = yield* SessionSource
    const storage = yield* SessionStorage
    const pollExactSession = Effect.fn("SessionSurface.pollExactSession")(
      function* (view: SessionView) {
        const result = yield* source.poll(view.sessionId).pipe(Effect.result)
        if (
          Result.isSuccess(result) &&
          !sameSessionIdentity(view.sessionId, result.success.sessionId)
        ) {
          return {
            view,
            result: Result.fail(
              new SessionSourceError({
                code: "invalid-evidence",
                message: "Codex persisted evidence is incompatible",
              }),
            ),
          } satisfies ExactPollOutcome
        }
        return { view, result } satisfies ExactPollOutcome
      },
    )

    const pollCommitted = Effect.fn("SessionSurface.pollCommitted")(
      function* (current: SessionStorageSnapshot) {
        if (current.views.length === 0) {
          return yield* new SessionSourceError({
            code: "unavailable",
            message: "Codex persisted evidence is unavailable",
          })
        }
        const outcomes = yield* Effect.forEach(
          current.views,
          pollExactSession,
        )
        const observedAtMs = yield* Clock.currentTimeMillis
        return yield* reducePolling(current, outcomes, observedAtMs)
      },
    )

    const reconcile = Effect.fn("SessionSurface.reconcile")(function* (
      current: SessionStorageSnapshot,
      trigger: SessionTransitionTrigger,
    ) {
      if (trigger._tag === "Polling") {
        return yield* pollCommitted(current)
      }

      const discovered = yield* source.discover().pipe(Effect.result)
      if (Result.isFailure(discovered)) {
        if (current.views.length === 0) return yield* discovered.failure

        const observedAtMs = yield* Clock.currentTimeMillis
        return yield* reducePolling(
          current,
          current.views.map((view) => ({
            view,
            result: Result.fail(discovered.failure),
          })),
          observedAtMs,
        )
      }

      const observedAtMs = yield* Clock.currentTimeMillis
      return yield* reduceDiscovery(
        current,
        discovered.success,
        observedAtMs,
      )
    })

    const finalizeObservation = Effect.fn(
      "SessionSurface.finalizeObservation",
    )(function* (
      current: SessionStorageSnapshot,
      currentEvent: SessionProtocolEvent | undefined,
      reducedResult: Result.Result<ObservationDecision, SessionSourceError>,
    ) {
      if (Result.isFailure(reducedResult)) {
        return {
          event: sourceErrorEvent(reducedResult.failure),
          snapshot: current,
          publish: true,
        } satisfies FinalizedObservation
      }

      const reduced = reducedResult.success
      const requiresSnapshot =
        currentEvent === undefined || currentEvent._tag === "SessionUnavailable"
      if (reduced.changedViews.length === 0 && !requiresSnapshot) {
        return {
          event: currentEvent,
          snapshot: current,
          publish: false,
        } satisfies FinalizedObservation
      }

      const eventResult = yield* (
        requiresSnapshot
          ? ensurePublishableEvent(snapshotEvent(reduced.views))
          : selectPublishableEvent(reduced)
      ).pipe(Effect.result)
      if (Result.isFailure(eventResult)) {
        return {
          event: overviewUnavailableEvent(),
          snapshot: current,
          publish: true,
        } satisfies FinalizedObservation
      }

      if (reduced.changedViews.length === 0) {
        return {
          event: eventResult.success,
          snapshot: current,
          publish: true,
        } satisfies FinalizedObservation
      }

      const nextSnapshot: SessionStorageSnapshot = {
        views: reduced.views,
        lastCommitSequence: reduced.lastCommitSequence,
      }
      const firstChangedView = reduced.changedViews[0]
      if (firstChangedView === undefined) {
        return {
          event: storageUnavailableEvent(),
          snapshot: current,
          publish: true,
        } satisfies FinalizedObservation
      }
      const commitResult = yield* storage
        .commit(current.lastCommitSequence, {
          recordedAtMs: reduced.recordedAtMs,
          changedViews: [firstChangedView, ...reduced.changedViews.slice(1)],
        })
        .pipe(Effect.result)
      return Result.isFailure(commitResult)
        ? {
            event: storageUnavailableEvent(),
            snapshot: current,
            publish: true,
          } satisfies FinalizedObservation
        : {
            event: eventResult.success,
            snapshot: nextSnapshot,
            publish: true,
          } satisfies FinalizedObservation
    })

    const restored = yield* storage.load()
    const initialResult = yield* reconcile(
      restored,
      SessionTransitionTrigger.Discovery(),
    ).pipe(Effect.result)
    const initial = yield* finalizeObservation(
      restored,
      undefined,
      initialResult,
    )

    const eventState = yield* makeEventState(
      initial.event,
      initial.snapshot,
    )
    const transitionSemaphore = yield* Semaphore.make(1)

    const inspectHistoryPage = Effect.fn(
      "SessionSurface.inspectHistoryPage",
    )(function* (
      sessionId: SessionIdentity,
      cursor: SessionHistoryCursor | null,
    ) {
      const loaded = yield* storage.loadHistoryPage(sessionId, cursor).pipe(
        Effect.result,
      )
      if (Result.isFailure(loaded)) {
        return SessionHistoryUnavailable.make({
          protocolVersion: 4,
          sessionId,
          code: "history-unavailable",
          message: "PackWalk could not read its retained session history",
        })
      }
      if (Option.isNone(loaded.success)) {
        return SessionHistoryUnavailable.make({
          protocolVersion: 4,
          sessionId,
          code: cursor === null ? "session-not-found" : "invalid-history-cursor",
          message: cursor === null
            ? "PackWalk has no retained history for that exact session"
            : "PackWalk could not continue that retained session history query",
        })
      }

      const page = loaded.success.value
      return SessionHistoryPage.make({
        protocolVersion: 4,
        sessionId,
        explainedView: page.explainedView,
        historyCoverage: page.historyCoverage,
        omittedContent: sessionHistoryOmittedContent,
        unsupportedFacts: sessionHistoryUnsupportedFacts,
        facts: page.facts,
        afterCommitSequence: cursor?.afterCommitSequence ?? 0,
        throughCommitSequence: page.throughCommitSequence,
        nextAfterCommitSequence: page.nextAfterCommitSequence,
      })
    })

    const observeOnce = Effect.fn("SessionSurface.observeOnce")(function* (
      trigger: SessionTransitionTrigger,
    ) {
      const currentEvent = yield* eventState.currentEvent
      const current = yield* eventState.committed
      const reducedResult = yield* reconcile(current, trigger).pipe(
        Effect.result,
      )
      const finalized = yield* finalizeObservation(
        current,
        currentEvent,
        reducedResult,
      )
      if (finalized.publish) {
        yield* eventState.publish(finalized.event, finalized.snapshot)
      }
    })

    const refresh = Effect.fn("SessionSurface.refresh")(() =>
      transitionSemaphore
        .withPermit(observeOnce(SessionTransitionTrigger.Discovery()))
        .pipe(
          Effect.catch(() =>
            eventState.publish(
              sourceUnavailableEvent("source-incompatible"),
            ),
          ),
        ),
    )

    const pollOnce = Effect.fn("SessionSurface.pollOnce")(() =>
      transitionSemaphore.withPermit(
        observeOnce(SessionTransitionTrigger.Polling()),
      ),
    )

    const runPolling = pollOnce().pipe(
      Effect.repeat(Schedule.spaced("1 second")),
      Effect.delay("1 second"),
      Effect.andThen(Effect.never),
    )

    return Service.of({
      events: eventState.events,
      inspectHistoryPage,
      refresh,
      runPolling,
    })
  }),
)

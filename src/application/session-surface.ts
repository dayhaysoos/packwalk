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
  SessionProtocolEvent,
  SessionTransitionTrigger,
  type CodexPersistedFact,
  type SessionIdentity,
  type SessionRetentionReason,
  type SessionView,
  transitionSession,
} from "../domain/session.js"

export interface Interface {
  readonly events: Stream.Stream<SessionProtocolEvent>
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
        protocolVersion: 3,
        code,
        message: "PackWalk found ambiguous Codex persisted evidence",
      })
    : SessionProtocolEvent.cases.SessionUnavailable.make({
        protocolVersion: 3,
        code,
        message: "PackWalk could not read supported Codex persisted evidence",
      })

const storageUnavailableEvent = (): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionUnavailable.make({
    protocolVersion: 3,
    code: "storage-unavailable",
    message: "PackWalk could not commit its current session view",
  })

const overviewUnavailableEvent = (): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionUnavailable.make({
    protocolVersion: 3,
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
        protocolVersion: 3,
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
  function* (accumulator: ObservationAccumulator) {
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

    return yield* completeObservation(accumulator)
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

    return yield* completeObservation(accumulator)
  },
)

const snapshotEvent = (
  views: NonEmptyReadonlyArray<SessionView>,
): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionsSnapshot.make({
    protocolVersion: 3,
    views,
  })

const updatedEvent = (
  decision: ObservationDecision,
): SessionProtocolEvent => {
  const firstChanged = decision.changedSessionIds[0]
  if (firstChanged === undefined) return snapshotEvent(decision.views)

  return SessionProtocolEvent.cases.SessionsUpdated.make({
    protocolVersion: 3,
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

    const restored = yield* storage.load()
    const initialResult = yield* reconcile(
      restored,
      SessionTransitionTrigger.Discovery(),
    ).pipe(Effect.result)
    const initial = Result.isFailure(initialResult)
      ? {
          event:
            initialResult.failure instanceof SessionSourceError
              ? sourceErrorEvent(initialResult.failure)
              : sourceUnavailableEvent("source-incompatible"),
          snapshot: restored,
        }
      : yield* Effect.gen(function* () {
          const reduced = initialResult.success
          const eventResult = yield* ensurePublishableEvent(
            snapshotEvent(reduced.views),
          ).pipe(Effect.result)
          if (Result.isFailure(eventResult)) {
            return {
              event: overviewUnavailableEvent(),
              snapshot: restored,
            }
          }

          if (reduced.changedViews.length > 0) {
            const commitResult = yield* storage
              .commit(restored.lastCommitSequence, reduced.changedViews)
              .pipe(Effect.result)
            if (Result.isFailure(commitResult)) {
              return {
                event: storageUnavailableEvent(),
                snapshot: restored,
              }
            }
          }

          return {
            event: eventResult.success,
            snapshot: {
              views: reduced.views,
              lastCommitSequence: reduced.lastCommitSequence,
            },
          }
        })

    const eventState = yield* makeEventState(
      initial.event,
      initial.snapshot,
    )
    const transitionSemaphore = yield* Semaphore.make(1)

    const observeOnce = Effect.fn("SessionSurface.observeOnce")(function* (
      trigger: SessionTransitionTrigger,
    ) {
      const currentEvent = yield* eventState.currentEvent
      const current = yield* eventState.committed
      const reducedResult = yield* reconcile(current, trigger).pipe(
        Effect.result,
      )
      if (Result.isFailure(reducedResult)) {
        if (reducedResult.failure instanceof SessionSourceError) {
          yield* eventState.publish(sourceErrorEvent(reducedResult.failure))
          return
        }
        yield* eventState.publish(sourceUnavailableEvent("source-incompatible"))
        return
      }

      const reduced = reducedResult.success
      if (reduced.changedViews.length === 0) {
        if (currentEvent._tag === "SessionUnavailable") {
          const eventResult = yield* ensurePublishableEvent(
            snapshotEvent(reduced.views),
          ).pipe(Effect.result)
          yield* eventState.publish(
            Result.isFailure(eventResult)
              ? overviewUnavailableEvent()
              : eventResult.success,
            current,
          )
        }
        return
      }

      const eventResult = yield* (
        currentEvent._tag === "SessionUnavailable"
          ? ensurePublishableEvent(snapshotEvent(reduced.views))
          : selectPublishableEvent(reduced)
      ).pipe(Effect.result)
      if (Result.isFailure(eventResult)) {
        yield* eventState.publish(overviewUnavailableEvent())
        return
      }

      const nextSnapshot: SessionStorageSnapshot = {
        views: reduced.views,
        lastCommitSequence: reduced.lastCommitSequence,
      }
      yield* storage
        .commit(current.lastCommitSequence, reduced.changedViews)
        .pipe(
          Effect.matchEffect({
            onFailure: () =>
              eventState.publish(storageUnavailableEvent()),
            onSuccess: () =>
              eventState.publish(eventResult.success, nextSnapshot),
          }),
        )
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

    return Service.of({ events: eventState.events, refresh, runPolling })
  }),
)

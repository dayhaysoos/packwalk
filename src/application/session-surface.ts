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
  encodeSessionProtocolEvent,
  matchTransition,
  matchSessionTransitionTrigger,
  sameSessionIdentity,
  type IllegalSessionTransition,
  SessionEvent,
  SessionProtocolEvent,
  SessionTransitionTrigger,
  type CodexPersistedFact,
  type SessionIdentity,
  type SessionView,
  transitionSession,
} from "../domain/session.js"

export interface Interface {
  readonly events: Stream.Stream<SessionProtocolEvent>
  readonly refresh: () => Effect.Effect<void>
  readonly runPolling: Effect.Effect<never, IllegalSessionTransition>
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

const sourceUnavailableEvent = (
  code:
    | "source-incompatible"
    | "source-unavailable"
    | "source-ambiguous",
): SessionProtocolEvent =>
  code === "source-ambiguous"
    ? SessionProtocolEvent.cases.SessionUnavailable.make({
        protocolVersion: 2,
        code,
        message: "PackWalk found ambiguous Codex persisted evidence",
      })
    : SessionProtocolEvent.cases.SessionUnavailable.make({
        protocolVersion: 2,
        code,
        message: "PackWalk could not read supported Codex persisted evidence",
      })

const storageUnavailableEvent = (): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionUnavailable.make({
    protocolVersion: 2,
    code: "storage-unavailable",
    message: "PackWalk could not commit its current session view",
  })

const overviewUnavailableEvent = (): SessionProtocolEvent =>
  SessionProtocolEvent.cases.SessionUnavailable.make({
    protocolVersion: 2,
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
      return SessionEvent.cases.SessionsSnapshot.make({
        protocolVersion: 2,
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

const reduceObservation = Effect.fn("SessionSurface.reduceObservation")(
  function* (
    current: SessionStorageSnapshot,
    sourceFacts: ReadonlyArray<CodexPersistedFact>,
    observedAtMs: number,
    trigger: SessionTransitionTrigger,
  ) {
    const facts = yield* validateFacts(sourceFacts)
    const nextByIdentity = new Map(
      current.views.map((view) => [view.sessionId, view] as const),
    )
    const changedViews: Array<SessionView> = []
    const changedSessionIds: Array<SessionIdentity> = []
    let lastCommitSequence = current.lastCommitSequence

    for (const [factIndex, fact] of facts.entries()) {
      const currentView = matchSessionTransitionTrigger(trigger, {
        Discovery: () => nextByIdentity.get(fact.sessionId),
        Polling: () => current.views[factIndex],
      })
      const requiresExistingIdentity = matchSessionTransitionTrigger(trigger, {
        Discovery: () => false,
        Polling: () => true,
      })
      if (requiresExistingIdentity && currentView === undefined) {
        return yield* new SessionSourceError({
          code: "invalid-evidence",
          message: "Codex persisted evidence is incompatible",
        })
      }
      const decision = transitionSession(
        currentView === undefined ? Option.none() : Option.some(currentView),
        fact,
        observedAtMs,
        trigger,
        lastCommitSequence + 1,
      )
      if (Result.isFailure(decision)) {
        return yield* decision.failure
      }

      yield* matchTransition(decision.success, {
        NoChange: () => Effect.void,
        Changed: ({ view }) =>
          Effect.sync(() => {
            lastCommitSequence = view.commitSequence
            nextByIdentity.set(view.sessionId, view)
            changedViews.push(view)
            changedSessionIds.push(view.sessionId)
          }),
      })
    }

    const orderedViews = Array.from(nextByIdentity.values()).sort(
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
      changedViews,
      changedSessionIds,
      lastCommitSequence,
    } satisfies ObservationDecision
  },
)

const snapshotEvent = (
  views: NonEmptyReadonlyArray<SessionView>,
): SessionProtocolEvent =>
  SessionEvent.cases.SessionsSnapshot.make({
    protocolVersion: 2,
    views,
  })

const updatedEvent = (
  decision: ObservationDecision,
): SessionProtocolEvent => {
  const firstChanged = decision.changedSessionIds[0]
  if (firstChanged === undefined) return snapshotEvent(decision.views)

  return SessionEvent.cases.SessionsUpdated.make({
    protocolVersion: 2,
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
    const restored = yield* storage.load()
    const initialResult = yield* source.discover().pipe(Effect.result)
    const initial = Result.isFailure(initialResult)
      ? {
          event: sourceErrorEvent(initialResult.failure),
          snapshot: restored,
        }
      : yield* Effect.gen(function* () {
          const observedAtMs = yield* Clock.currentTimeMillis
          const reducedResult = yield* reduceObservation(
            restored,
            initialResult.success,
            observedAtMs,
            SessionTransitionTrigger.Discovery(),
          ).pipe(Effect.result)
          if (Result.isFailure(reducedResult)) {
            return {
              event:
                reducedResult.failure instanceof SessionSourceError
                  ? sourceErrorEvent(reducedResult.failure)
                  : sourceUnavailableEvent("source-incompatible"),
              snapshot: restored,
            }
          }

          const reduced = reducedResult.success
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
    const pollExactSession = Effect.fn("SessionSurface.pollExactSession")(
      function* (view: SessionView) {
        const fact = yield* source.poll(view.sessionId)
        if (!sameSessionIdentity(view.sessionId, fact.sessionId)) {
          return yield* new SessionSourceError({
            code: "invalid-evidence",
            message: "Codex persisted evidence is incompatible",
          })
        }
        return fact
      },
    )

    const observeOnce = Effect.fn("SessionSurface.observeOnce")(function* (
      trigger: SessionTransitionTrigger,
    ) {
      const currentEvent = yield* eventState.currentEvent
      const current = yield* eventState.committed
      const skipUnavailablePoll = matchSessionTransitionTrigger(trigger, {
        Discovery: () => false,
        Polling: () => currentEvent._tag === "SessionUnavailable",
      })
      if (skipUnavailablePoll) return

      const factResult = yield* matchSessionTransitionTrigger(trigger, {
        Discovery: () => source.discover(),
        Polling: () =>
          current.views.length === 0
            ? Effect.fail(
                new SessionSourceError({
                  code: "unavailable",
                  message: "Codex persisted evidence is unavailable",
                }),
              )
            : Effect.forEach(current.views, (view) =>
                pollExactSession(view),
              ),
      }).pipe(Effect.result)
      if (Result.isFailure(factResult)) {
        yield* eventState.publish(sourceErrorEvent(factResult.failure))
        return
      }

      const observedAtMs = yield* Clock.currentTimeMillis
      const reducedResult = yield* reduceObservation(
        current,
        factResult.success,
        observedAtMs,
        trigger,
      ).pipe(Effect.result)
      if (Result.isFailure(reducedResult)) {
        if (reducedResult.failure instanceof SessionSourceError) {
          yield* eventState.publish(sourceErrorEvent(reducedResult.failure))
          return
        }

        const recoverableDiscoveryFailure =
          matchSessionTransitionTrigger(trigger, {
            Discovery: () => true,
            Polling: () => false,
          })
        if (!recoverableDiscoveryFailure) {
          return yield* reducedResult.failure
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

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

import { Service as SessionSource } from "./session-source.js"
import { Service as SessionStorage } from "./session-storage.js"
import {
  matchTransition,
  SessionEvent,
  SessionTransitionTrigger,
  transitionSession,
} from "../domain/session.js"

export interface Interface {
  readonly events: Stream.Stream<SessionEvent>
  readonly refresh: () => Effect.Effect<void>
  readonly runPolling: Effect.Effect<never, import("../domain/session.js").IllegalSessionTransition>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionSurface",
) {}

interface SessionEventEnvelope {
  readonly revision: number
  readonly event: SessionEvent
}

const sourceUnavailableEvent = (
  code: "source-incompatible" | "source-unavailable",
): SessionEvent =>
  SessionEvent.cases.SessionUnavailable.make({
    protocolVersion: 1,
    code,
    message: "PackWalk could not read supported Codex persisted evidence",
  })

const storageUnavailableEvent = (): SessionEvent =>
  SessionEvent.cases.SessionUnavailable.make({
    protocolVersion: 1,
    code: "storage-unavailable",
    message: "PackWalk could not commit its current session view",
  })

const asCurrentSnapshot = (event: SessionEvent): SessionEvent =>
  event._tag === "SessionUpdated"
    ? SessionEvent.cases.SessionSnapshot.make({
        protocolVersion: 1,
        view: event.view,
      })
    : event

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
  function* (initialEvent: SessionEvent) {
    const current = yield* Ref.make<SessionEventEnvelope>({
      revision: 0,
      event: initialEvent,
    })
    const updates = yield* Effect.acquireRelease(
      PubSub.sliding<SessionEventEnvelope>(1),
      PubSub.shutdown,
    )
    const publish = Effect.fn("SessionSurface.publish")(function* (
      event: SessionEvent,
    ) {
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
      currentEvent: Ref.get(current).pipe(Effect.map((envelope) => envelope.event)),
      events: publicEvents(current, updates),
      publish,
    }
  },
)

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const source = yield* SessionSource
    const storage = yield* SessionStorage
    const restored = yield* storage.load()
    const initialResult = yield* source.discover().pipe(Effect.result)

    if (Result.isFailure(initialResult)) {
      const unavailable = sourceUnavailableEvent(
        initialResult.failure.code === "unavailable"
          ? "source-unavailable"
          : "source-incompatible",
      )
      const eventState = yield* makeEventState(unavailable)
      return Service.of({
        events: eventState.events,
        refresh: Effect.fn("SessionSurface.refresh")(() => Effect.void),
        runPolling: Effect.never,
      })
    }

    const initialFact = initialResult.success
    const observedAtMs = yield* Clock.currentTimeMillis
    const initialDecision = transitionSession(
      restored,
      initialFact,
      observedAtMs,
      SessionTransitionTrigger.Discovery(),
    )

    if (Result.isFailure(initialDecision)) {
      return yield* initialDecision.failure
    }

    const initialEvent =
      initialDecision.success._tag === "NoChange"
        ? Option.match(restored, {
            onNone: () => {
              throw new Error("Initial discovery did not produce a session snapshot")
            },
            onSome: (view) =>
              SessionEvent.cases.SessionSnapshot.make({
                protocolVersion: 1,
                view,
              }),
          })
        : initialDecision.success.event

    if (initialDecision.success._tag === "Changed") {
      yield* storage.commit(initialDecision.success.view)
    }
    const eventState = yield* makeEventState(initialEvent)
    const transitionSemaphore = yield* Semaphore.make(1)

    const observeOnce = Effect.fn("SessionSurface.observeOnce")(function* (
      trigger: SessionTransitionTrigger,
    ) {
      const currentEvent = yield* eventState.currentEvent
      if (currentEvent._tag === "SessionUnavailable") {
        return
      }

      const factResult = yield* (
        trigger._tag === "Discovery"
          ? source.discover()
          : source.poll(currentEvent.view.sessionId)
      ).pipe(Effect.result)
      if (Result.isFailure(factResult)) {
        yield* eventState.publish(
          sourceUnavailableEvent(
            factResult.failure.code === "unavailable"
              ? "source-unavailable"
              : "source-incompatible",
          ),
        )
        return
      }

      const now = yield* Clock.currentTimeMillis
      const decision = transitionSession(
        Option.some(currentEvent.view),
        factResult.success,
        now,
        trigger,
      )
      if (Result.isFailure(decision)) {
        if (trigger._tag === "Polling") {
          return yield* decision.failure
        }
        yield* eventState.publish(
          sourceUnavailableEvent("source-incompatible"),
        )
        return
      }

      yield* matchTransition(decision.success, {
        NoChange: () => Effect.void,
        Changed: ({ event, view }) =>
          storage.commit(view).pipe(
            Effect.matchEffect({
              onFailure: () =>
                eventState.publish(storageUnavailableEvent()),
              onSuccess: () => eventState.publish(event),
            }),
          ),
      })
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

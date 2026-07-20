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
import { Service as SessionStorage } from "./session-storage.js"
import {
  matchTransition,
  matchSessionTransitionTrigger,
  SessionEvent,
  SessionTransitionTrigger,
  type SessionView,
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
  function* (
    initialEvent: SessionEvent,
    initialView: Option.Option<SessionView>,
  ) {
    const current = yield* Ref.make<SessionEventEnvelope>({
      revision: 0,
      event: initialEvent,
    })
    const committedView = yield* Ref.make(initialView)
    const updates = yield* Effect.acquireRelease(
      PubSub.sliding<SessionEventEnvelope>(1),
      PubSub.shutdown,
    )
    const publish = Effect.fn("SessionSurface.publish")(function* (
      event: SessionEvent,
    ) {
      if (event._tag !== "SessionUnavailable") {
        yield* Ref.set(committedView, Option.some(event.view))
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
      committedView: Ref.get(committedView),
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
    const initial = Result.isFailure(initialResult)
      ? {
          event: sourceUnavailableEvent(
            initialResult.failure.code === "unavailable"
              ? "source-unavailable"
              : "source-incompatible",
          ),
          view: restored,
        }
      : yield* Effect.gen(function* () {
          const observedAtMs = yield* Clock.currentTimeMillis
          const decision = transitionSession(
            restored,
            initialResult.success,
            observedAtMs,
            SessionTransitionTrigger.Discovery(),
          )
          if (Result.isFailure(decision)) {
            return yield* decision.failure
          }

          if (decision.success._tag === "NoChange") {
            return Option.match(restored, {
              onNone: () => {
                throw new Error(
                  "Initial discovery did not produce a session snapshot",
                )
              },
              onSome: (view) => ({
                event: SessionEvent.cases.SessionSnapshot.make({
                  protocolVersion: 1,
                  view,
                }),
                view: restored,
              }),
            })
          }

          yield* storage.commit(decision.success.view)
          return {
            event: decision.success.event,
            view: Option.some(decision.success.view),
          }
        })

    const eventState = yield* makeEventState(initial.event, initial.view)
    const transitionSemaphore = yield* Semaphore.make(1)

    const observeOnce = Effect.fn("SessionSurface.observeOnce")(function* (
      trigger: SessionTransitionTrigger,
    ) {
      const currentEvent = yield* eventState.currentEvent
      const currentView = yield* eventState.committedView
      const skipUnavailablePoll = matchSessionTransitionTrigger(trigger, {
        Discovery: () => false,
        Polling: () => currentEvent._tag === "SessionUnavailable",
      })
      if (skipUnavailablePoll) {
        return
      }

      const factResult = yield* matchSessionTransitionTrigger(trigger, {
        Discovery: () => source.discover(),
        Polling: () =>
          Option.match(currentView, {
            onNone: () =>
              Effect.fail(
                new SessionSourceError({
                  code: "unavailable",
                  message: "Codex persisted evidence is unavailable",
                }),
              ),
            onSome: (view) => source.poll(view.sessionId),
          }),
      }).pipe(Effect.result)
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
        currentView,
        factResult.success,
        now,
        trigger,
      )
      if (Result.isFailure(decision)) {
        return yield* matchSessionTransitionTrigger(trigger, {
          Discovery: () =>
            eventState.publish(
              sourceUnavailableEvent("source-incompatible"),
            ),
          Polling: () => decision.failure,
        })
      }

      yield* matchTransition(decision.success, {
        NoChange: () =>
          currentEvent._tag === "SessionUnavailable"
            ? Option.match(currentView, {
                onNone: () => Effect.void,
                onSome: (view) =>
                  eventState.publish(
                    SessionEvent.cases.SessionSnapshot.make({
                      protocolVersion: 1,
                      view,
                    }),
                  ),
              })
            : Effect.void,
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

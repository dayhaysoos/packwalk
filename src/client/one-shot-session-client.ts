import { Effect, Option, Schema, Stream } from "effect"

import { SessionEvent } from "../domain/session.js"
import {
  type ClientOutputError,
  formatSessionEvent,
} from "./session-client.js"

export class OneShotSessionError extends Schema.TaggedErrorClass<OneShotSessionError>()(
  "PackWalk.OneShotSessionError",
  {
    reason: Schema.Literals([
      "empty-session-stream",
      "invalid-session-event",
    ]),
  },
) {}

export interface OneShotClientPort {
  readonly writeDocument: (
    document: string,
  ) => Effect.Effect<void, ClientOutputError>
}

export interface OneShotSessionClientOptions {
  readonly format: "text" | "json"
  readonly lineSeparator: string
}

const SessionEventJson = Schema.fromJsonString(SessionEvent)

export const runOneShotSessionClient = Effect.fn(
  "OneShotSessionClient.run",
)(
  <E, R>(
    events: Stream.Stream<SessionEvent, E, R>,
    client: OneShotClientPort,
    options: OneShotSessionClientOptions,
  ): Effect.Effect<void, ClientOutputError | E | OneShotSessionError, R> =>
    Effect.gen(function* () {
      const event = yield* Stream.runHead(events).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new OneShotSessionError({ reason: "empty-session-stream" }),
              ),
            onSome: Effect.succeed,
          }),
        ),
      )
      const body =
        options.format === "text"
          ? formatSessionEvent(event).join(options.lineSeparator)
          : yield* Schema.encodeEffect(SessionEventJson)(event).pipe(
              Effect.mapError(
                () =>
                  new OneShotSessionError({
                    reason: "invalid-session-event",
                  }),
              ),
            )
      const document = `${body}${options.lineSeparator}`
      yield* client.writeDocument(document)
    }),
)

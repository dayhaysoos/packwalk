import { Context, Effect, Option, Schema } from "effect"

import type { SessionView } from "../domain/session.js"

export class SessionStorageError extends Schema.TaggedErrorClass<SessionStorageError>()(
  "PackWalk.SessionStorageError",
  {
    operation: Schema.Literals([
      "SessionStorage.open",
      "SessionStorage.decodeRow",
      "SessionStorage.load",
      "SessionStorage.commit",
    ]),
    message: Schema.Literals([
      "PackWalk could not open its session storage",
      "PackWalk could not decode its stored session view",
      "PackWalk could not read its stored session view",
      "PackWalk could not commit its current session view",
    ]),
  },
) {}

export interface Interface {
  readonly load: () => Effect.Effect<Option.Option<SessionView>, SessionStorageError>
  readonly commit: (view: SessionView) => Effect.Effect<void, SessionStorageError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionStorage",
) {}

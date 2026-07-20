import { Context, Effect, Schema } from "effect"

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

export interface SessionStorageSnapshot {
  readonly views: ReadonlyArray<SessionView>
  readonly lastCommitSequence: number
}

export interface Interface {
  readonly load: () => Effect.Effect<
    SessionStorageSnapshot,
    SessionStorageError
  >
  readonly commit: (
    expectedPreviousCommitSequence: number,
    changedViews: ReadonlyArray<SessionView>,
  ) => Effect.Effect<void, SessionStorageError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionStorage",
) {}

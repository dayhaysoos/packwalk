import { Context, Effect, Schema } from "effect"

import type {
  CodexPersistedFact,
  SessionIdentity,
} from "../domain/session.js"

export type NonEmptySessionFacts = readonly [
  CodexPersistedFact,
  ...CodexPersistedFact[],
]

export class SessionSourceError extends Schema.TaggedErrorClass<SessionSourceError>()(
  "PackWalk.SessionSourceError",
  {
    code: Schema.Literals([
      "unavailable",
      "unsupported",
      "invalid-evidence",
      "ambiguous",
    ]),
    message: Schema.String,
  },
) {}

export interface Interface {
  readonly discover: () => Effect.Effect<
    NonEmptySessionFacts,
    SessionSourceError
  >
  readonly poll: (
    sessionId: SessionIdentity,
  ) => Effect.Effect<CodexPersistedFact, SessionSourceError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionSource",
) {}

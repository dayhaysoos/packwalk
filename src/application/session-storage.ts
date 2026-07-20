import { Context, Effect, Option, Schema } from "effect"

import type {
  SessionEvidenceFact,
  SessionHistoryCoverage,
  SessionHistoryCursor,
  SessionIdentity,
  SessionView,
} from "../domain/session.js"

export class SessionStorageError extends Schema.TaggedErrorClass<SessionStorageError>()(
  "PackWalk.SessionStorageError",
  {
    operation: Schema.Literals([
      "SessionStorage.open",
      "SessionStorage.decodeRow",
      "SessionStorage.load",
      "SessionStorage.loadHistoryPage",
      "SessionStorage.commit",
    ]),
    message: Schema.Literals([
      "PackWalk could not open its session storage",
      "PackWalk could not decode its stored session view",
      "PackWalk could not read its stored session view",
      "PackWalk could not read its retained session history",
      "PackWalk could not commit its current session view",
    ]),
  },
) {}

export interface SessionStorageSnapshot {
  readonly views: ReadonlyArray<SessionView>
  readonly lastCommitSequence: number
}

export type NonEmptySessionViews = readonly [SessionView, ...SessionView[]]

export interface SessionObservationCommit {
  readonly recordedAtMs: number
  readonly changedViews: NonEmptySessionViews
}

export interface SessionHistoryPage {
  readonly explainedView: SessionView
  readonly historyCoverage: SessionHistoryCoverage
  readonly facts: readonly [SessionEvidenceFact, ...SessionEvidenceFact[]]
  readonly throughCommitSequence: number
  readonly nextAfterCommitSequence: number | null
}

export interface Interface {
  readonly load: () => Effect.Effect<
    SessionStorageSnapshot,
    SessionStorageError
  >
  readonly loadHistoryPage: (
    sessionId: SessionIdentity,
    cursor: SessionHistoryCursor | null,
  ) => Effect.Effect<Option.Option<SessionHistoryPage>, SessionStorageError>
  readonly commit: (
    expectedPreviousCommitSequence: number,
    observation: SessionObservationCommit,
  ) => Effect.Effect<void, SessionStorageError>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionStorage",
) {}

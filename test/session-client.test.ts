import { expect, it } from "@effect/vitest"
import { Effect, Ref, Stream } from "effect"

import { runSessionClient, type ClientPort } from "../src/client/session-client.js"
import {
  ProjectIdentity,
  SessionEvent,
  SessionIdentity,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

it.effect("writes discovered and polled public views as visibly different CLI frames", () =>
  Effect.gen(function* () {
    const frames = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const client: ClientPort = {
      writeFrame: (lines) => Ref.update(frames, (rendered) => [...rendered, lines]),
    }
    const discovered = SessionView.make({
      protocolVersion: 1,
      sessionId: SessionIdentity.make(sessionId),
      projectIdentity: ProjectIdentity.make(
        "C:\\work\\fixture-project",
      ),
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: SessionState.cases.Discovered.make({}),
      freshness: "fresh",
      sourceUpdatedAtMs: 1_000,
      observedAtMs: 2_000,
      commitSequence: 1,
    })
    const polled = SessionView.make({
      ...discovered,
      state: SessionState.cases.Polled.make({}),
      sourceUpdatedAtMs: 2_500,
      observedAtMs: 3_000,
      commitSequence: 2,
    })

    yield* runSessionClient(
      Stream.make(
        SessionEvent.cases.SessionSnapshot.make({
          protocolVersion: 1,
          view: discovered,
        }),
        SessionEvent.cases.SessionUpdated.make({
          protocolVersion: 1,
          view: polled,
        }),
      ),
      client,
    )

    expect(yield* Ref.get(frames)).toEqual([
      [
        "PROJECT            STATE        ACTIVITY                  UPDATED",
        "fixture-project    DISCOVERED   persisted Codex activity  1970-01-01 00:00:01Z",
      ],
      [
        "PROJECT            STATE        ACTIVITY                  UPDATED",
        "fixture-project    POLLED       persisted Codex activity  1970-01-01 00:00:02Z",
      ],
    ])
  }),
)

it.effect("escapes the visible project label and omits exact identities and source details", () =>
  Effect.gen(function* () {
    const frames = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const client: ClientPort = {
      writeFrame: (lines) => Ref.update(frames, (rendered) => [...rendered, lines]),
    }
    const projectIdentity = "/work/repo\r\n"
    const controlledSessionId = "session\t\u0000\u007f"
    const view = SessionView.make({
      protocolVersion: 1,
      sessionId: SessionIdentity.make(controlledSessionId),
      projectIdentity: ProjectIdentity.make(projectIdentity),
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: SessionState.cases.Discovered.make({}),
      freshness: "fresh",
      sourceUpdatedAtMs: 1_000,
      observedAtMs: 2_000,
      commitSequence: 1,
    })

    yield* runSessionClient(
      Stream.make(
        SessionEvent.cases.SessionSnapshot.make({ protocolVersion: 1, view }),
      ),
      client,
    )

    expect(yield* Ref.get(frames)).toEqual([
      [
        "PROJECT            STATE        ACTIVITY                  UPDATED",
        "repo\\u000D\\u000A   DISCOVERED   persisted Codex activity  1970-01-01 00:00:01Z",
      ],
    ])
    expect(JSON.stringify(yield* Ref.get(frames))).not.toContain(
      controlledSessionId,
    )
    expect(view.projectIdentity).toBe(projectIdentity)
    expect(view.sessionId).toBe(controlledSessionId)
  }),
)

it.effect("truncates a long project component and keeps a useful root fallback", () =>
  Effect.gen(function* () {
    const frames = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const client: ClientPort = {
      writeFrame: (lines) => Ref.update(frames, (rendered) => [...rendered, lines]),
    }
    const makeView = (projectIdentity: string) =>
      SessionView.make({
        protocolVersion: 1,
        sessionId: SessionIdentity.make(sessionId),
        projectIdentity: ProjectIdentity.make(projectIdentity),
        activity: "persisted Codex activity",
        evidenceSource: "codex-sqlite-thread-index",
        state: SessionState.cases.Discovered.make({}),
        freshness: "fresh",
        sourceUpdatedAtMs: 1_000,
        observedAtMs: 2_000,
        commitSequence: 1,
      })

    yield* runSessionClient(
      Stream.make(
        SessionEvent.cases.SessionSnapshot.make({
          protocolVersion: 1,
          view: makeView("/work/repository-with-very-long-name"),
        }),
        SessionEvent.cases.SessionSnapshot.make({
          protocolVersion: 1,
          view: makeView("/"),
        }),
      ),
      client,
    )

    expect(yield* Ref.get(frames)).toEqual([
      [
        "PROJECT            STATE        ACTIVITY                  UPDATED",
        "repository-wit...  DISCOVERED   persisted Codex activity  1970-01-01 00:00:01Z",
      ],
      [
        "PROJECT            STATE        ACTIVITY                  UPDATED",
        "/                  DISCOVERED   persisted Codex activity  1970-01-01 00:00:01Z",
      ],
    ])
  }),
)

it.effect("renders unavailable as one redacted table row", () =>
  Effect.gen(function* () {
    const frames = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const client: ClientPort = {
      writeFrame: (lines) => Ref.update(frames, (rendered) => [...rendered, lines]),
    }

    yield* runSessionClient(
      Stream.make(
        SessionEvent.cases.SessionUnavailable.make({
          protocolVersion: 1,
          code: "source-incompatible",
          message: "PackWalk could not read supported Codex persisted evidence",
        }),
      ),
      client,
    )

    expect(yield* Ref.get(frames)).toEqual([
      [
        "PROJECT            STATE        ACTIVITY                  UPDATED",
        "-                  UNAVAILABLE  details unavailable       -",
      ],
    ])
  }),
)

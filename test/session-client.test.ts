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

    const rendered = yield* Ref.get(frames)
    expect(rendered).toHaveLength(2)

    const initial = rendered[0]?.join("\n") ?? ""
    const updated = rendered[1]?.join("\n") ?? ""
    for (const frame of [initial, updated]) {
      expect(frame).toContain("fixture-project")
      expect(frame).toContain(sessionId)
      expect(frame).toContain("persisted Codex activity")
      expect(frame).toContain("codex-sqlite-thread-index")
      expect(frame).toContain("fresh")
      expect(frame).not.toMatch(/\b(?:LIVE|WATCHED)\b/u)
    }
    expect(initial).toContain("DISCOVERED")
    expect(initial).toContain("1970-01-01T00:00:01.000Z")
    expect(initial).toContain("1970-01-01T00:00:02.000Z")
    expect(updated).toContain("POLLED")
    expect(updated).toContain("1970-01-01T00:00:02.500Z")
    expect(updated).toContain("1970-01-01T00:00:03.000Z")
  }),
)

it.effect("makes subsecond polling updates visibly distinct", () =>
  Effect.gen(function* () {
    const frames = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
    const client: ClientPort = {
      writeFrame: (lines) => Ref.update(frames, (rendered) => [...rendered, lines]),
    }
    const first = SessionView.make({
      protocolVersion: 1,
      sessionId: SessionIdentity.make(sessionId),
      projectIdentity: ProjectIdentity.make("fixture-project"),
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: SessionState.cases.Polled.make({}),
      freshness: "fresh",
      sourceUpdatedAtMs: 2_500,
      observedAtMs: 2_750,
      commitSequence: 2,
    })
    const second = SessionView.make({
      ...first,
      sourceUpdatedAtMs: 2_600,
      observedAtMs: 2_850,
      commitSequence: 3,
    })

    yield* runSessionClient(
      Stream.make(
        SessionEvent.cases.SessionSnapshot.make({ protocolVersion: 1, view: first }),
        SessionEvent.cases.SessionUpdated.make({ protocolVersion: 1, view: second }),
      ),
      client,
    )

    const rendered = yield* Ref.get(frames)
    expect(rendered[0]).not.toEqual(rendered[1])
    expect(rendered[0]?.join("\n")).toContain("1970-01-01T00:00:02.500Z")
    expect(rendered[0]?.join("\n")).toContain("1970-01-01T00:00:02.750Z")
    expect(rendered[1]?.join("\n")).toContain("1970-01-01T00:00:02.600Z")
    expect(rendered[1]?.join("\n")).toContain("1970-01-01T00:00:02.850Z")
  }),
)

it.effect("escapes every visible identity without truncating source details", () =>
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

    const rendered = JSON.stringify(yield* Ref.get(frames))
    expect(rendered).toContain("repo\\\\u000D\\\\u000A")
    expect(rendered).toContain("session\\\\u0009\\\\u0000\\\\u007F")
    expect(rendered).toContain("codex-sqlite-thread-index")
    expect(rendered).toContain("fresh")
    expect(rendered).not.toContain(controlledSessionId)
    expect(view.projectIdentity).toBe(projectIdentity)
    expect(view.sessionId).toBe(controlledSessionId)
  }),
)

it.effect("keeps a complete project component and a useful root fallback", () =>
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

    const rendered = yield* Ref.get(frames)
    expect(rendered[0]?.join("\n")).toContain(
      "repository-with-very-long-name",
    )
    expect(rendered[1]?.join("\n")).toContain("/")
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

    const rendered = yield* Ref.get(frames)
    expect(rendered).toHaveLength(1)
    expect(rendered[0]).toHaveLength(6)
    expect(rendered[0]?.join("\n")).toContain("UNAVAILABLE")
    expect(rendered[0]?.join("\n")).toContain("details unavailable")
  }),
)

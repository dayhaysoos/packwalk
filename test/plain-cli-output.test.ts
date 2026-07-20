import { expect, it } from "@effect/vitest"
import { Effect, Ref, Sink, Stdio, Stream } from "effect"

import {
  makeOneShotCliOutput,
  makePlainCliOutputWith,
  writeCliFailure,
  writeCliUsage,
} from "../src/client/plain-cli-output.js"
import { runSessionClient } from "../src/client/session-client.js"
import {
  ProjectIdentity,
  SessionEvent,
  SessionIdentity,
  SessionState,
  SessionView,
} from "../src/domain/session.js"

const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"

const sessionEvents = () => {
  const discovered = SessionView.make({
    protocolVersion: 1,
    sessionId: SessionIdentity.make(sessionId),
    projectIdentity: ProjectIdentity.make("fixture-project"),
    activity: "persisted Codex activity",
    evidenceSource: "codex-sqlite-thread-index",
    state: SessionState.cases.Discovered.make({}),
    freshness: "fresh",
    sourceUpdatedAtMs: 1_000,
    observedAtMs: 2_000,
    commitSequence: 1,
  })

  return Stream.make(
    SessionEvent.cases.SessionSnapshot.make({
      protocolVersion: 1,
      view: discovered,
    }),
    SessionEvent.cases.SessionUpdated.make({
      protocolVersion: 1,
      view: SessionView.make({
        ...discovered,
        state: SessionState.cases.Polled.make({}),
        sourceUpdatedAtMs: 2_500,
        observedAtMs: 3_000,
        commitSequence: 2,
      }),
    }),
  )
}

it.effect("writes a one-shot document exactly once without terminal behavior", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const stdioLayer = Stdio.layerTest({
      stdout: () =>
        Sink.forEach((chunk: string | Uint8Array) =>
          Ref.update(bytes, (current) => `${current}${String(chunk)}`),
        ),
    })
    const output = yield* makeOneShotCliOutput.pipe(
      Effect.provide(stdioLayer),
    )

    yield* output.writeDocument("first\r\nsecond\r\n")

    expect(yield* Ref.get(bytes)).toBe("first\r\nsecond\r\n")
  }),
)

it.effect("writes invalid-command usage only to stderr", () =>
  Effect.gen(function* () {
    const stdout = yield* Ref.make("")
    const stderr = yield* Ref.make("")

    yield* writeCliUsage("Usage: packwalk [text|json]", "\r\n").pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(stdout, (current) => `${current}${String(chunk)}`),
            ),
          stderr: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(stderr, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    expect(yield* Ref.get(stdout)).toBe("")
    expect(yield* Ref.get(stderr)).toBe(
      "Usage: packwalk [text|json]\r\n",
    )
  }),
)

it.effect("writes a redacted failure with the selected platform separator", () =>
  Effect.gen(function* () {
    const stderr = yield* Ref.make("")

    yield* writeCliFailure("\r\n").pipe(
      Effect.provide(
        Stdio.layerTest({
          stderr: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(stderr, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    expect(yield* Ref.get(stderr)).toBe(
      "PackWalk could not complete its local session command. No Codex session was changed.\r\n",
    )
  }),
)

it.effect("appends plain frames without terminal controls on non-TTY output", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: false,
      supportsCursorMovement: false,
      columns: () => undefined,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* output.writeFrame(["PackWalk", "first row"])
    yield* output.writeFrame(["PackWalk", "second row"])

    expect(yield* Ref.get(bytes)).toBe(
      "PackWalk\nfirst row\nPackWalk\nsecond row\n",
    )
  }),
)

it.effect("appends plain frames when the terminal cannot move the cursor", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: false,
      columns: () => 80,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* output.writeFrame(["PackWalk", "first row"])
    yield* output.writeFrame(["PackWalk", "second row"])

    expect(yield* Ref.get(bytes)).toBe(
      "PackWalk\nfirst row\nPackWalk\nsecond row\n",
    )
  }),
)

it.effect("redraws a later terminal frame in place", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: true,
      columns: () => 80,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* output.writeFrame(["PackWalk", "first row"])
    yield* output.writeFrame(["PackWalk", "second row"])

    expect(yield* Ref.get(bytes)).toBe(
      "PackWalk\nfirst row\n" +
        "\u001B[2A\r\u001B[2KPackWalk\n\r\u001B[2Ksecond row\n",
    )
  }),
)

it.effect("redraws complete session frames on an 80-column terminal", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: true,
      columns: () => 80,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* runSessionClient(sessionEvents(), output)

    const rendered = yield* Ref.get(bytes)
    expect(rendered).toContain("\u001B[6A")
    expect(rendered.split("\r\u001B[2K")).toHaveLength(7)
    expect(rendered.match(new RegExp(sessionId, "gu"))).toHaveLength(2)
    expect(rendered).toContain("codex-sqlite-thread-index")
    expect(rendered).toContain("1970-01-01T00:00:01.000Z")
    expect(rendered).toContain("1970-01-01T00:00:02.500Z")
    expect(rendered).toContain("1970-01-01T00:00:03.000Z")
  }),
)

it.effect("appends complete session frames when the terminal is too narrow", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: true,
      columns: () => 60,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* runSessionClient(sessionEvents(), output)

    const rendered = yield* Ref.get(bytes)
    expect(rendered).not.toContain("\u001B")
    expect(rendered.match(/SOURCE UPDATED/gu)).toHaveLength(2)
    expect(rendered.match(new RegExp(sessionId, "gu"))).toHaveLength(2)
    expect(rendered).toContain("DISCOVERED")
    expect(rendered).toContain("POLLED")
  }),
)

it.effect("stays append-only after a frame contains wide Unicode text", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: true,
      columns: () => 80,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* output.writeFrame(["PROJECT  STATE", "packwalk  DISCOVERED"])
    yield* output.writeFrame(["PROJECT  STATE", "包步  POLLED"])
    yield* output.writeFrame(["PROJECT  STATE", "packwalk  POLLED"])

    expect(yield* Ref.get(bytes)).toBe(
      "PROJECT  STATE\npackwalk  DISCOVERED\n" +
        "PROJECT  STATE\n包步  POLLED\n" +
        "PROJECT  STATE\npackwalk  POLLED\n",
    )
  }),
)

it.effect("stays append-only when a resized terminal reaches the line width", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    let columns = 80
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: true,
      columns: () => columns,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )
    yield* output.writeFrame(["short"])
    columns = 5
    yield* output.writeFrame(["short"])
    columns = 80
    yield* output.writeFrame(["later"])

    expect(yield* Ref.get(bytes)).toBe("short\nshort\nlater\n")
  }),
)

it.effect("clears surplus terminal lines before a later frame grows again", () =>
  Effect.gen(function* () {
    const bytes = yield* Ref.make("")
    const output = yield* makePlainCliOutputWith({
      isTerminal: true,
      supportsCursorMovement: true,
      columns: () => 80,
    }).pipe(
      Effect.provide(
        Stdio.layerTest({
          stdout: () =>
            Sink.forEach((chunk: string | Uint8Array) =>
              Ref.update(bytes, (current) => `${current}${String(chunk)}`),
            ),
        }),
      ),
    )

    yield* output.writeFrame(["heading", "old row one", "old row two"])
    yield* output.writeFrame(["only row"])
    yield* output.writeFrame(["heading", "new row"])

    expect(yield* Ref.get(bytes)).toBe(
      "heading\nold row one\nold row two\n" +
        "\u001B[3A\r\u001B[2Konly row\n" +
        "\r\u001B[2K\n\r\u001B[2K\u001B[1A" +
        "\u001B[1A\r\u001B[2Kheading\n\r\u001B[2Knew row\n",
    )
  }),
)

import { expect, it } from "@effect/vitest"
import { Effect, Ref, Sink, Stdio } from "effect"

import { makePlainCliOutputWith } from "../src/client/plain-cli-output.js"

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

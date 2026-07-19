import { Effect, Ref, Stdio, Stream } from "effect"

import {
  ClientOutputError,
  type ClientPort,
} from "./session-client.js"

export interface PlainCliOutputOptions {
  readonly isTerminal: boolean
  readonly supportsCursorMovement: boolean
  readonly columns: () => number | undefined
}

const plainFrame = (lines: ReadonlyArray<string>): string =>
  lines.length === 0 ? "" : `${lines.join("\n")}\n`

const isSafeSingleLineAsciiFrame = (
  lines: ReadonlyArray<string>,
  columns: number | undefined,
): boolean =>
  Number.isInteger(columns) &&
  columns !== undefined &&
  columns > 0 &&
  lines.length > 0 &&
  lines.every(
    (line) =>
      line.length > 0 &&
      line.length < columns &&
      /^[\u0020-\u007E]+$/u.test(line),
  )

const terminalRefresh = (
  previousLineCount: number,
  lines: ReadonlyArray<string>,
): string => {
  const moveToFirstLine =
    previousLineCount === 0 ? "" : `\u001B[${previousLineCount}A`
  const rendered = lines
    .map((line) => `\r\u001B[2K${line}\n`)
    .join("")
  const surplusLineCount = Math.max(0, previousLineCount - lines.length)
  const clearedSurplus = Array.from(
    { length: surplusLineCount },
    (_, index) =>
      `\r\u001B[2K${index < surplusLineCount - 1 ? "\n" : ""}`,
  ).join("")
  const restoreBelowFrame =
    surplusLineCount > 1 ? `\u001B[${surplusLineCount - 1}A` : ""

  return `${moveToFirstLine}${rendered}${clearedSurplus}${restoreBelowFrame}`
}

export const makePlainCliOutputWith = (options: PlainCliOutputOptions) =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio
    const previousLineCount = yield* Ref.make<number | undefined>(undefined)
    const redrawEnabled = yield* Ref.make(
      options.isTerminal && options.supportsCursorMovement,
    )

    return {
      writeFrame: Effect.fn("PlainCliOutput.writeFrame")((lines) => {
        const frameCanRedraw = isSafeSingleLineAsciiFrame(
          lines,
          options.columns(),
        )

        return Ref.getAndUpdate(
          redrawEnabled,
          (enabled) => enabled && frameCanRedraw,
        ).pipe(
          Effect.flatMap((wasEnabled) =>
            Ref.getAndSet(previousLineCount, lines.length).pipe(
              Effect.flatMap((previous) => {
                const bytes =
                  wasEnabled && frameCanRedraw && previous !== undefined
                    ? terminalRefresh(previous, lines)
                    : plainFrame(lines)

                return Stream.make(bytes).pipe(
                  Stream.run(stdio.stdout({ endOnDone: false })),
                )
              }),
            ),
          ),
          Effect.mapError(
            () =>
              new ClientOutputError({
                message: "PackWalk could not write its command-line view",
              }),
          ),
        )
      }),
    } satisfies ClientPort
  })

export const makePlainCliOutput = makePlainCliOutputWith({
  isTerminal: process.stdout.isTTY === true,
  supportsCursorMovement: process.env.TERM !== "dumb",
  columns: () => process.stdout.columns,
})

export const writeCliFailure = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio
  yield* Stream.make(
    "PackWalk could not connect to its local session service. No Codex session was changed.\n",
  ).pipe(Stream.run(stdio.stderr({ endOnDone: false })))
})

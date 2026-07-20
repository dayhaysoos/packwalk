export const escapeTerminalText = (value: string): string =>
  Array.from(value, (character) => {
    if (character === "\\") return "\\\\"
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)
      ? `\\u${codePoint.toString(16).toUpperCase().padStart(4, "0")}`
      : character
  }).join("")

export const utcTimestamp = (epochMs: number): string =>
  new Date(epochMs).toISOString()

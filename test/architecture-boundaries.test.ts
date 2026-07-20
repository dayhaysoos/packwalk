import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const sourceRoot = join(repositoryRoot, "src")

const sourceFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : []
  })

it("keeps node:sqlite inside the approved storage adapter", () => {
  const sqliteImports = sourceFiles(sourceRoot)
    .filter((path) => readFileSync(path, "utf8").includes("node:sqlite"))
    .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"))
    .sort()

  expect(sqliteImports).toEqual(["adapters/sqlite-session-storage.ts"])
})

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

import { expect, it } from "vitest"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))

it("removes stale test artifacts before compiling production output", () => {
  const staleDirectory = join(repositoryRoot, "dist", "testing")
  const staleArtifact = join(staleDirectory, "stale-helper.js")
  mkdirSync(staleDirectory, { recursive: true })
  writeFileSync(staleArtifact, "stale generated output\n", "utf8")

  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--silent"], {
    cwd: repositoryRoot,
    stdio: "pipe",
  })

  expect(existsSync(staleArtifact)).toBe(false)
  expect(existsSync(staleDirectory)).toBe(false)
})

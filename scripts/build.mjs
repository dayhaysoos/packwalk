import { spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const compiler = resolve(repositoryRoot, "node_modules", "typescript", "bin", "tsc")

rmSync(resolve(repositoryRoot, "dist"), { recursive: true, force: true })

const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.build.json"], {
  cwd: repositoryRoot,
  stdio: "inherit",
})

if (result.error !== undefined) {
  throw result.error
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1
}

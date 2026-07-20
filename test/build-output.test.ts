import type { ChildProcess } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { once } from "node:events"
import { createServer, type Server, type Socket } from "node:net"
import { EOL, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { expect, it } from "vitest"

import { deriveRuntimePaths } from "../src/adapters/runtime-paths.js"
import {
  runBoundedCommand,
  terminateActiveProcessTrees,
  type ProcessResult,
} from "./support/bounded-process.js"
import { createNpmRunInvocation } from "./support/npm-invocation.js"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const commandTimeoutMs = 30_000

const runDocumentedPackWalk = (
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
  activeChildren: Set<ChildProcess>,
): Promise<ProcessResult> => {
  const npmEntryPoint = process.env.npm_execpath
  if (npmEntryPoint === undefined || npmEntryPoint.length === 0) {
    throw new Error("PackWalk process test requires npm_execpath")
  }
  const invocation = createNpmRunInvocation({
    nodeExecutable: process.execPath,
    npmEntryPoint,
    script: "packwalk",
    args,
  })
  return runBoundedCommand({
    ...invocation,
    cwd: repositoryRoot,
    environment,
    activeChildren,
    timeoutMs: commandTimeoutMs,
  })
}

const closeServer = async (
  server: Server,
  sockets: ReadonlySet<Socket>,
): Promise<void> => {
  for (const socket of sockets) {
    socket.destroy()
  }
  if (!server.listening) return
  const closed = once(server, "close")
  server.close()
  await closed
}

it("builds clean output and keeps documented one-shot stdout machine-clean", {
  timeout: 120_000,
}, async () => {
  if (
    process.platform !== "darwin" &&
    process.platform !== "linux" &&
    process.platform !== "win32"
  ) {
    throw new Error("PackWalk process test requires a supported platform")
  }

  const readme = readFileSync(join(repositoryRoot, "README.md"), "utf8")
  expect(readme).toContain("npm run --silent packwalk -- text")
  expect(readme).toContain("npm run --silent packwalk -- json")

  const staleDirectory = join(repositoryRoot, "dist", "testing")
  const staleArtifact = join(staleDirectory, "stale-helper.js")
  mkdirSync(staleDirectory, { recursive: true })
  writeFileSync(staleArtifact, "stale generated output\n", "utf8")

  const testRoot = mkdtempSync(join(tmpdir(), "pw3-"))
  const homeDirectory = join(testRoot, "home")
  const tempDirectory = join(testRoot, "temp")
  const runtimeDirectory = join(testRoot, "runtime")
  const dataDirectory = join(testRoot, "data")
  const localAppData = join(testRoot, "local-app-data")
  const codexHome = join(testRoot, "codex")
  for (const directory of [
    homeDirectory,
    tempDirectory,
    runtimeDirectory,
    dataDirectory,
    localAppData,
    codexHome,
  ]) {
    mkdirSync(directory, { recursive: true })
  }

  const runtimePaths = deriveRuntimePaths({
    platform: process.platform,
    homeDirectory,
    tempDirectory,
    ...(typeof process.getuid === "function"
      ? { userId: String(process.getuid()) }
      : {}),
    codexHome,
    localAppData,
    xdgDataHome: dataDirectory,
    xdgRuntimeDirectory: runtimeDirectory,
  })
  if (runtimePaths.ipcDirectory !== undefined) {
    mkdirSync(dirname(runtimePaths.ipcEndpoint), { recursive: true })
  }

  const sessionId = "019f77d2-1a10-7cf0-b5df-76eebb4071ab"
  const event = {
    _tag: "SessionSnapshot",
    protocolVersion: 1,
    view: {
      protocolVersion: 1,
      sessionId,
      projectIdentity: "fixture-project",
      activity: "persisted Codex activity",
      evidenceSource: "codex-sqlite-thread-index",
      state: { _tag: "Discovered" },
      freshness: "fresh",
      sourceUpdatedAtMs: 1_000,
      observedAtMs: 2_000,
      commitSequence: 1,
    },
  }
  const sockets = new Set<Socket>()
  const activeChildren = new Set<ChildProcess>()
  let connectionCount = 0
  const server = createServer((socket) => {
    sockets.add(socket)
    connectionCount += 1
    socket.once("close", () => sockets.delete(socket))
    let command = ""
    let responded = false
    socket.setEncoding("utf8")
    socket.on("data", (chunk: string) => {
      command += chunk
      if (!responded && command.includes("\n")) {
        responded = true
        socket.write(`${JSON.stringify(event)}\n`)
      }
    })
  })

  const environment = {
    ...process.env,
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
    TMPDIR: tempDirectory,
    TEMP: tempDirectory,
    TMP: tempDirectory,
    CODEX_HOME: codexHome,
    XDG_DATA_HOME: dataDirectory,
    XDG_RUNTIME_DIR: runtimeDirectory,
    LOCALAPPDATA: localAppData,
  }

  try {
    const listening = once(server, "listening")
    server.listen(runtimePaths.ipcEndpoint)
    await listening

    const text = await runDocumentedPackWalk(
      ["text"],
      environment,
      activeChildren,
    )
    const json = await runDocumentedPackWalk(
      ["json"],
      environment,
      activeChildren,
    )
    const invalid = await runDocumentedPackWalk(
      ["--json"],
      environment,
      activeChildren,
    )

    expect(existsSync(staleArtifact)).toBe(false)
    expect(existsSync(staleDirectory)).toBe(false)

    expect(text.exitCode).toBe(0)
    expect(text.stderr).toBe("")
    expect(text.stdout.endsWith(EOL)).toBe(true)
    expect(text.stdout.slice(0, -EOL.length).split(EOL)).toHaveLength(6)
    expect(text.stdout).toContain(sessionId)
    expect(text.stdout).not.toContain("\u001B")

    expect(json.exitCode).toBe(0)
    expect(json.stderr).toBe("")
    expect(json.stdout.endsWith(EOL)).toBe(true)
    expect(JSON.parse(json.stdout)).toEqual(event)

    expect(invalid.exitCode).toBe(1)
    expect(invalid.stdout).toBe("")
    expect(invalid.stderr).toBe(`Usage: packwalk [text|json]${EOL}`)
    expect(connectionCount).toBe(2)
  } finally {
    try {
      await terminateActiveProcessTrees(activeChildren)
    } finally {
      await closeServer(server, sockets)
      rmSync(testRoot, { recursive: true, force: true })
    }
  }
})

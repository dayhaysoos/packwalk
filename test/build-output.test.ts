import { spawn, type ChildProcess } from "node:child_process"
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

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const commandTimeoutMs = 30_000
const gracefulKillWaitMs = 1_000
const forceKillDelayMs = 2_000
const taskkillTimeoutMs = 5_000

interface ProcessResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

interface DeadlineExceeded {
  readonly _tag: "DeadlineExceeded"
}

const raceWithDeadline = async <A>(
  completion: Promise<A>,
  timeoutMs: number,
): Promise<A | DeadlineExceeded> => {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<DeadlineExceeded>((resolve) => {
    timer = setTimeout(
      () => resolve({ _tag: "DeadlineExceeded" }),
      timeoutMs,
    )
  })
  try {
    return await Promise.race([completion, deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null

const waitForExit = async (
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> => {
  if (hasExited(child)) return true

  return await new Promise<boolean>((resolve) => {
    const onClose = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.off("close", onClose)
      resolve(hasExited(child))
    }, timeoutMs)
    child.once("close", onClose)
  })
}

const processGroupExists = (pid: number): boolean => {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return false
    }
    throw error
  }
}

const waitForProcessGroupExit = async (
  pid: number,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!processGroupExists(pid)) return true
    await delay(25)
  }
  return !processGroupExists(pid)
}

const signalProcessGroup = (
  pid: number,
  signal: "SIGTERM" | "SIGKILL",
): void => {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return
    }
    throw error
  }
}

interface TaskkillResult {
  readonly _tag: "TaskkillResult"
  readonly exitCode: number | null
  readonly spawnError?: Error
}

const runTaskkill = async (
  pid: number,
  force: boolean,
): Promise<TaskkillResult> => {
  const args = ["/pid", String(pid), "/T"]
  if (force) args.push("/F")
  const taskkill = spawn("taskkill", args, {
    stdio: "ignore",
    windowsHide: true,
  })
  const completion = new Promise<TaskkillResult>((resolve) => {
    taskkill.once("error", (error) =>
      resolve({ _tag: "TaskkillResult", exitCode: null, spawnError: error }),
    )
    taskkill.once("close", (exitCode) =>
      resolve({ _tag: "TaskkillResult", exitCode }),
    )
  })
  const outcome = await raceWithDeadline(completion, taskkillTimeoutMs)
  if (outcome._tag === "TaskkillResult") return outcome

  taskkill.kill("SIGKILL")
  if (!(await waitForExit(taskkill, forceKillDelayMs))) {
    throw new Error("Windows process-tree cleanup command did not exit")
  }
  throw new Error("Windows process-tree cleanup command timed out")
}

const terminateWindowsProcessTree = async (
  child: ChildProcess,
  pid: number,
): Promise<void> => {
  const graceful = await runTaskkill(pid, false)
  const gracefulSucceeded =
    graceful.spawnError === undefined && graceful.exitCode === 0
  if (gracefulSucceeded) {
    if (await waitForExit(child, forceKillDelayMs)) return
  }

  const forced = await runTaskkill(pid, true)
  if (forced.spawnError !== undefined || forced.exitCode !== 0) {
    if (
      gracefulSucceeded &&
      (await waitForExit(child, forceKillDelayMs))
    ) {
      return
    }
    throw new Error("Windows process-tree cleanup failed")
  }
  if (!(await waitForExit(child, forceKillDelayMs))) {
    throw new Error("Windows process tree did not exit after forced cleanup")
  }
}

const terminatePosixProcessTree = async (
  child: ChildProcess,
  pid: number,
): Promise<void> => {
  signalProcessGroup(pid, "SIGTERM")
  if (!(await waitForProcessGroupExit(pid, gracefulKillWaitMs))) {
    signalProcessGroup(pid, "SIGKILL")
    if (!(await waitForProcessGroupExit(pid, forceKillDelayMs))) {
      throw new Error("POSIX process tree did not exit after SIGKILL")
    }
  }
  if (!(await waitForExit(child, forceKillDelayMs))) {
    throw new Error("POSIX process-tree owner did not close")
  }
}

const terminateProcessTree = async (child: ChildProcess): Promise<void> => {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === "win32") {
    await terminateWindowsProcessTree(child, pid)
    return
  }
  await terminatePosixProcessTree(child, pid)
}

const terminateActiveProcessTrees = async (
  activeChildren: Set<ChildProcess>,
): Promise<void> => {
  const children = Array.from(activeChildren)
  const outcomes = await Promise.allSettled(
    children.map((child) => terminateProcessTree(child)),
  )
  for (const [index, outcome] of outcomes.entries()) {
    if (outcome.status === "fulfilled") {
      const child = children[index]
      if (child !== undefined) activeChildren.delete(child)
    }
  }
  const failures = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  )
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.reason),
      "PackWalk test process-tree cleanup failed",
    )
  }
}

const runBoundedCommand = async (
  command: string,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
  activeChildren: Set<ChildProcess>,
  timeoutMs: number,
): Promise<ProcessResult> => {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  })
  activeChildren.add(child)
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })

  const completion = new Promise<
    | { readonly _tag: "Complete"; readonly exitCode: number | null }
    | { readonly _tag: "SpawnError"; readonly error: Error }
  >((resolve) => {
    child.once("error", (error) => resolve({ _tag: "SpawnError", error }))
    child.once("close", (exitCode) =>
      resolve({ _tag: "Complete", exitCode }),
    )
  })
  const outcome = await raceWithDeadline(completion, timeoutMs)

  if (outcome._tag === "Complete") {
    activeChildren.delete(child)
    return { exitCode: outcome.exitCode, stdout, stderr }
  }
  if (outcome._tag === "SpawnError") {
    activeChildren.delete(child)
    throw outcome.error
  }

  const timeoutError = new Error(
    `Documented PackWalk command exceeded ${timeoutMs}ms`,
  )
  try {
    await terminateProcessTree(child)
    activeChildren.delete(child)
  } catch (cleanupError) {
    throw new AggregateError(
      [timeoutError, cleanupError],
      "Timed-out PackWalk command cleanup failed",
    )
  }
  throw timeoutError
}

const runDocumentedPackWalk = (
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
  activeChildren: Set<ChildProcess>,
): Promise<ProcessResult> =>
  runBoundedCommand(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "--silent", "packwalk", "--", ...args],
    environment,
    activeChildren,
    commandTimeoutMs,
  )

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

it("terminates a timed-out disposable process tree within its cleanup bound", {
  timeout: 10_000,
}, async () => {
  const activeChildren = new Set<ChildProcess>()
  const nestedProcess = [
    'const { spawn } = require("node:child_process");',
    'spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    "setInterval(() => {}, 1000);",
  ].join("")

  try {
    await expect(
      runBoundedCommand(
        process.execPath,
        ["-e", nestedProcess],
        process.env,
        activeChildren,
        200,
      ),
    ).rejects.toThrow("exceeded 200ms")
  } finally {
    await terminateActiveProcessTrees(activeChildren)
  }
  expect(activeChildren.size).toBe(0)
})

import { spawn, type ChildProcess } from "node:child_process"

const gracefulKillWaitMs = 1_000
const forceKillWaitMs = 2_000
const taskkillTimeoutMs = 5_000

export interface ProcessResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}

export class BoundedCommandTimeout extends Error {
  readonly stdout: string
  readonly stderr: string

  constructor(timeoutMs: number, stdout: string, stderr: string) {
    super(`Bounded command exceeded ${timeoutMs}ms`)
    this.name = "BoundedCommandTimeout"
    this.stdout = stdout
    this.stderr = stderr
  }
}

export interface RunBoundedCommandOptions {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly environment: NodeJS.ProcessEnv
  readonly activeChildren: Set<ChildProcess>
  readonly timeoutMs: number
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

export const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
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
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      return true
    }
    throw error
  }
}

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

type PosixProcessGroupKill = (
  pid: number,
  signal: number | NodeJS.Signals,
) => boolean

interface PosixProcessGroupControl {
  readonly exists: (pid: number) => boolean
  readonly signal: (
    pid: number,
    signal: "SIGTERM" | "SIGKILL",
  ) => void
}

const hasErrorCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code

const makePosixProcessGroupControl = (
  kill: PosixProcessGroupKill,
): PosixProcessGroupControl => ({
  exists: (pid) => {
    try {
      kill(-pid, 0)
      return true
    } catch (error) {
      if (hasErrorCode(error, "ESRCH")) return false
      // EPERM proves the group still exists, not that cleanup failed.
      if (hasErrorCode(error, "EPERM")) return true
      throw error
    }
  },
  signal: (pid, signal) => {
    try {
      kill(-pid, signal)
    } catch (error) {
      if (hasErrorCode(error, "ESRCH")) return
      // Keep an indeterminate group under the bounded exit check below.
      if (hasErrorCode(error, "EPERM")) return
      throw error
    }
  },
})

const nativePosixProcessGroup = makePosixProcessGroupControl(
  (pid, signal) => process.kill(pid, signal),
)

const waitForProcessGroupExit = async (
  pid: number,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!nativePosixProcessGroup.exists(pid)) return true
    await delay(25)
  }
  return !nativePosixProcessGroup.exists(pid)
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
  if (!(await waitForExit(taskkill, forceKillWaitMs))) {
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
  if (gracefulSucceeded && (await waitForExit(child, forceKillWaitMs))) {
    return
  }

  const forced = await runTaskkill(pid, true)
  if (forced.spawnError !== undefined || forced.exitCode !== 0) {
    if (
      gracefulSucceeded &&
      (await waitForExit(child, forceKillWaitMs))
    ) {
      return
    }
    throw new Error("Windows process-tree cleanup failed")
  }
  if (!(await waitForExit(child, forceKillWaitMs))) {
    throw new Error("Windows process tree did not exit after forced cleanup")
  }
}

const terminatePosixProcessTree = async (
  child: ChildProcess,
  pid: number,
): Promise<void> => {
  nativePosixProcessGroup.signal(pid, "SIGTERM")
  if (!(await waitForProcessGroupExit(pid, gracefulKillWaitMs))) {
    nativePosixProcessGroup.signal(pid, "SIGKILL")
    if (!(await waitForProcessGroupExit(pid, forceKillWaitMs))) {
      throw new Error("POSIX process tree did not exit after SIGKILL")
    }
  }
  if (!(await waitForExit(child, forceKillWaitMs))) {
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

export const terminateActiveProcessTrees = async (
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

export const runBoundedCommand = async (
  options: RunBoundedCommandOptions,
): Promise<ProcessResult> => {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    detached: process.platform !== "win32",
    env: options.environment,
    stdio: ["ignore", "pipe", "pipe"],
  })
  options.activeChildren.add(child)
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
  const outcome = await raceWithDeadline(completion, options.timeoutMs)

  if (outcome._tag === "Complete") {
    options.activeChildren.delete(child)
    return { exitCode: outcome.exitCode, stdout, stderr }
  }
  if (outcome._tag === "SpawnError") {
    options.activeChildren.delete(child)
    throw outcome.error
  }

  const timeoutError = new BoundedCommandTimeout(
    options.timeoutMs,
    stdout,
    stderr,
  )
  try {
    await terminateProcessTree(child)
    options.activeChildren.delete(child)
  } catch (cleanupError) {
    throw new AggregateError(
      [timeoutError, cleanupError],
      "Timed-out PackWalk command cleanup failed",
    )
  }
  throw timeoutError
}

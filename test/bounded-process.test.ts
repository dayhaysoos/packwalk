import type { ChildProcess } from "node:child_process"

import { expect, it } from "vitest"

import {
  BoundedCommandTimeout,
  processExists,
  runBoundedCommand,
  terminateActiveProcessTrees,
} from "./support/bounded-process.js"

const waitForProcessToDisappear = async (
  pid: number,
  timeoutMs: number,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!processExists(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return !processExists(pid)
}

it("terminates a timed-out disposable process and its descendant", {
  timeout: 30_000,
}, async () => {
  const activeChildren = new Set<ChildProcess>()
  const nestedProcess = [
    'const { spawn } = require("node:child_process");',
    'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    'process.stdout.write(String(child.pid) + "\\n");',
    "setInterval(() => {}, 1000);",
  ].join("")
  let timeoutFailure: BoundedCommandTimeout | undefined

  try {
    await runBoundedCommand({
      command: process.execPath,
      args: ["-e", nestedProcess],
      cwd: process.cwd(),
      environment: process.env,
      activeChildren,
      timeoutMs: 2_000,
    })
    throw new Error("Expected the disposable process tree to time out")
  } catch (error) {
    if (!(error instanceof BoundedCommandTimeout)) throw error
    timeoutFailure = error
  } finally {
    await terminateActiveProcessTrees(activeChildren)
  }

  if (timeoutFailure === undefined) {
    throw new Error("Expected a bounded-command timeout failure")
  }
  const descendantPid = Number(timeoutFailure.stdout.trim())
  expect(Number.isSafeInteger(descendantPid)).toBe(true)
  expect(descendantPid).toBeGreaterThan(0)
  expect(await waitForProcessToDisappear(descendantPid, 2_000)).toBe(true)
  expect(activeChildren.size).toBe(0)
})

import { expect, it } from "vitest"

import { createNpmRunInvocation } from "./support/npm-invocation.js"

it("invokes npm through Node without a Windows command shim", () => {
  const invocation = createNpmRunInvocation({
    nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
    npmEntryPoint:
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
    script: "packwalk",
    args: ["text"],
  })

  expect(invocation).toEqual({
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: [
      "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
      "run",
      "--silent",
      "packwalk",
      "--",
      "text",
    ],
  })
  expect(invocation.command.endsWith(".cmd")).toBe(false)
})

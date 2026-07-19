import { describe, expect, it } from "vitest"

import { daemonLaunchOptions } from "../src/adapters/daemon-launcher.js"

describe("PackWalk daemon launch options", () => {
  it.each(["win32", "linux"] as const)(
    "detaches the daemon from the CLI on %s",
    (platform) => {
      expect(daemonLaunchOptions(platform)).toEqual({
        detached: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        extendEnv: true,
      })
    },
  )
})

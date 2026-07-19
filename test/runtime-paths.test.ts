import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect } from "effect"

import {
  deriveRuntimePaths,
  RuntimePaths,
  runtimePathsLayer,
} from "../src/adapters/runtime-paths.js"

describe("PackWalk runtime paths", () => {
  it("uses per-user local data and a Unix socket on macOS", () => {
    const paths = deriveRuntimePaths({
      platform: "darwin",
      homeDirectory: "/Users/example",
      tempDirectory: "/tmp",
      userId: "501",
    })

    expect(paths.codexDatabasePath).toBe(
      "/Users/example/.codex/state_5.sqlite",
    )
    expect(paths.packWalkDatabasePath).toBe(
      "/Users/example/Library/Application Support/PackWalk/packwalk.sqlite",
    )
    expect(paths.ipcEndpoint).toBe("/tmp/packwalk-501/daemon.sock")
    expect(paths.ipcDirectory).toBe("/tmp/packwalk-501")
  })

  it("honors XDG directories on Linux", () => {
    const paths = deriveRuntimePaths({
      platform: "linux",
      homeDirectory: "/home/example",
      tempDirectory: "/tmp",
      userId: "1000",
      xdgDataHome: "/home/example/.data",
      xdgRuntimeDirectory: "/run/user/1000",
      codexHome: "/home/example/codex-home",
    })

    expect(paths.codexDatabasePath).toBe(
      "/home/example/codex-home/state_5.sqlite",
    )
    expect(paths.packWalkDatabasePath).toBe(
      "/home/example/.data/packwalk/packwalk.sqlite",
    )
    expect(paths.ipcEndpoint).toBe(
      "/run/user/1000/packwalk-1000/daemon.sock",
    )
  })

  it("uses local application data and a per-user named pipe on Windows", () => {
    const paths = deriveRuntimePaths({
      platform: "win32",
      homeDirectory: "C:\\Users\\example",
      tempDirectory: "C:\\Temp",
      localAppData: "D:\\LocalData",
      codexHome: "D:\\Codex",
    })

    expect(paths.codexDatabasePath).toBe("D:\\Codex\\state_5.sqlite")
    expect(paths.packWalkDatabasePath).toBe(
      "D:\\LocalData\\PackWalk\\packwalk.sqlite",
    )
    expect(paths.ipcEndpoint).toMatch(
      /^\\\\\.\\pipe\\packwalk-[a-f0-9]{16}$/,
    )
    expect(paths.ipcDirectory).toBeUndefined()
  })

  it.each([
    {
      platform: "darwin" as const,
      input: { codexHome: "relative-codex-home" },
    },
    {
      platform: "darwin" as const,
      input: { xdgRuntimeDirectory: "relative-runtime" },
    },
    {
      platform: "linux" as const,
      input: { xdgDataHome: "relative-data" },
    },
    {
      platform: "linux" as const,
      input: { xdgRuntimeDirectory: "relative-runtime" },
    },
    {
      platform: "win32" as const,
      input: { codexHome: "relative-codex-home" },
    },
    {
      platform: "win32" as const,
      input: { localAppData: "relative-local-data" },
    },
  ])(
    "rejects relative $platform path overrides instead of resolving beneath the launch directory",
    ({ platform, input }) => {
      expect(() =>
        deriveRuntimePaths({
          platform,
          homeDirectory:
            platform === "win32" ? "C:\\Users\\example" : "/home/example",
          tempDirectory: platform === "win32" ? "C:\\Temp" : "/tmp",
          ...input,
        }),
      ).toThrow("Runtime path overrides must be absolute")
    },
  )

  it.effect("reads path overrides from the active Effect config provider", () => {
    const codexHome =
      process.platform === "win32"
        ? "D:\\ConfiguredCodex"
        : "/configured/codex"
    const expectedDatabasePath =
      process.platform === "win32"
        ? "D:\\ConfiguredCodex\\state_5.sqlite"
        : "/configured/codex/state_5.sqlite"

    return Effect.gen(function* () {
      const paths = yield* RuntimePaths

      expect(paths.codexDatabasePath).toBe(expectedDatabasePath)
    }).pipe(
      Effect.provide(runtimePathsLayer),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ CODEX_HOME: codexHome }),
        ),
      ),
    )
  })

  it.effect("fails visibly when Effect config supplies a relative path override", () =>
    Effect.gen(function* () {
      const error = yield* RuntimePaths.pipe(
        Effect.provide(runtimePathsLayer),
        Effect.flip,
      )

      expect(error).toMatchObject({
        _tag: "PackWalk.RuntimePathError",
        message: "PackWalk could not resolve local runtime paths",
      })
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ CODEX_HOME: "relative-codex-home" }),
        ),
      ),
    ),
  )
})

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
    })

    expect(paths.codexDatabasePath).toBe(
      "/Users/example/.codex/state_5.sqlite",
    )
    expect(paths.packWalkDatabasePath).toBe(
      "/Users/example/Library/Application Support/PackWalk/packwalk-v2.sqlite",
    )
    expect(paths.legacyPackWalkDatabasePath).toBe(
      "/Users/example/Library/Application Support/PackWalk/packwalk.sqlite",
    )
    expect(paths.ipcDirectory).toMatch(
      /^\/tmp\/packwalk-v2-[a-f0-9]{24}$/,
    )
    expect(paths.ipcEndpoint).toBe(
      `${paths.ipcDirectory}/daemon-v2.sock`,
    )
  })

  it("honors XDG directories on Linux", () => {
    const paths = deriveRuntimePaths({
      platform: "linux",
      homeDirectory: "/home/example",
      xdgDataHome: "/home/example/.data",
      codexHome: "/home/example/codex-home",
    })

    expect(paths.codexDatabasePath).toBe(
      "/home/example/codex-home/state_5.sqlite",
    )
    expect(paths.packWalkDatabasePath).toBe(
      "/home/example/.data/packwalk/packwalk-v2.sqlite",
    )
    expect(paths.legacyPackWalkDatabasePath).toBe(
      "/home/example/.data/packwalk/packwalk.sqlite",
    )
    expect(paths.ipcDirectory).toMatch(
      /^\/tmp\/packwalk-v2-[a-f0-9]{24}$/,
    )
    expect(paths.ipcEndpoint).toBe(
      `${paths.ipcDirectory}/daemon-v2.sock`,
    )
  })

  it("uses local application data and a per-user named pipe on Windows", () => {
    const paths = deriveRuntimePaths({
      platform: "win32",
      homeDirectory: "C:\\Users\\example",
      localAppData: "D:\\LocalData",
      codexHome: "D:\\Codex",
    })

    expect(paths.codexDatabasePath).toBe("D:\\Codex\\state_5.sqlite")
    expect(paths.packWalkDatabasePath).toBe(
      "D:\\LocalData\\PackWalk\\packwalk-v2.sqlite",
    )
    expect(paths.legacyPackWalkDatabasePath).toBe(
      "D:\\LocalData\\PackWalk\\packwalk.sqlite",
    )
    expect(paths.ipcEndpoint).toMatch(
      /^\\\\\.\\pipe\\packwalk-v2-[a-f0-9]{24}$/,
    )
    expect(paths.ipcDirectory).toBeUndefined()
  })

  it("uses one Unix endpoint for one durable database across launch homes", () => {
    const first = deriveRuntimePaths({
      platform: "linux",
      homeDirectory: "/home/example",
      xdgDataHome: "/home/example/.data",
    })
    const sameDatabase = deriveRuntimePaths({
      platform: "linux",
      homeDirectory: "/different/launch-home",
      xdgDataHome: "/home/example/.data",
    })
    const differentDatabase = deriveRuntimePaths({
      platform: "linux",
      homeDirectory: "/home/example",
      xdgDataHome: "/home/example/other-data",
    })

    expect(sameDatabase.packWalkDatabasePath).toBe(
      first.packWalkDatabasePath,
    )
    expect(sameDatabase.ipcEndpoint).toBe(first.ipcEndpoint)
    expect(sameDatabase.ipcDirectory).toBe(first.ipcDirectory)
    expect(differentDatabase.ipcEndpoint).not.toBe(first.ipcEndpoint)
    expect(first.ipcDirectory).toMatch(/^\/tmp\/packwalk-v2-[a-f0-9]+$/)
    expect(first.ipcEndpoint.length).toBeLessThan(100)
  })

  it("normalizes the durable Windows database identity for its named pipe", () => {
    const first = deriveRuntimePaths({
      platform: "win32",
      homeDirectory: "C:\\Users\\example",
      localAppData: "D:\\LocalData",
    })
    const sameDatabase = deriveRuntimePaths({
      platform: "win32",
      homeDirectory: "C:\\DifferentHome",
      localAppData: "d:/localdata",
    })
    const differentDatabase = deriveRuntimePaths({
      platform: "win32",
      homeDirectory: "C:\\Users\\example",
      localAppData: "E:\\LocalData",
    })

    expect(sameDatabase.ipcEndpoint).toBe(first.ipcEndpoint)
    expect(differentDatabase.ipcEndpoint).not.toBe(first.ipcEndpoint)
  })

  it.each([
    {
      platform: "darwin" as const,
      input: { codexHome: "relative-codex-home" },
    },
    {
      platform: "linux" as const,
      input: { xdgDataHome: "relative-data" },
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
          ConfigProvider.fromUnknown({
            CODEX_HOME: codexHome,
            XDG_RUNTIME_DIR: "ignored-relative-runtime-directory",
          }),
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

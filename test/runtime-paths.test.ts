import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Result } from "effect"

import {
  canonicalizeNativeDurablePath,
  deriveRuntimePaths,
  prepareRuntimeDirectories,
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

  it.skipIf(process.platform === "win32")(
    "uses one endpoint for physical database aliases before and after the database exists",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-path-alias-test-"))

      try {
        const physicalDataRoot = join(testRoot, "physical-data")
        const directoryAlias = join(testRoot, "directory-alias")
        mkdirSync(physicalDataRoot)
        symlinkSync(physicalDataRoot, directoryAlias, "dir")

        const physicalBeforeCreation = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/home/example",
            xdgDataHome: physicalDataRoot,
          },
          canonicalizeNativeDurablePath,
        )
        const aliasedBeforeCreation = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/different/launch-home",
            xdgDataHome: directoryAlias,
          },
          canonicalizeNativeDurablePath,
        )

        expect(aliasedBeforeCreation.packWalkDatabasePath).not.toBe(
          physicalBeforeCreation.packWalkDatabasePath,
        )
        expect(aliasedBeforeCreation.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )

        mkdirSync(join(physicalDataRoot, "packwalk"))
        writeFileSync(physicalBeforeCreation.packWalkDatabasePath, "database")
        const fileAliasDataRoot = join(testRoot, "file-alias-data")
        mkdirSync(join(fileAliasDataRoot, "packwalk"), { recursive: true })
        symlinkSync(
          physicalBeforeCreation.packWalkDatabasePath,
          join(fileAliasDataRoot, "packwalk", "packwalk-v2.sqlite"),
          "file",
        )

        const aliasedExistingFile = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/another/launch-home",
            xdgDataHome: fileAliasDataRoot,
          },
          canonicalizeNativeDurablePath,
        )

        expect(
          readFileSync(aliasedExistingFile.packWalkDatabasePath, "utf8"),
        ).toBe("database")
        expect(aliasedExistingFile.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )
      } finally {
        rmSync(testRoot, { recursive: true, force: true })
      }
    },
  )

  it.effect.skipIf(process.platform === "win32")(
    "rejects a symlinked Unix endpoint directory without changing its target",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-ipc-symlink-test-"))
      const targetDirectory = join(testRoot, "target")
      const ipcDirectory = join(testRoot, "predictable-ipc-leaf")
      mkdirSync(targetDirectory, { mode: 0o755 })
      chmodSync(targetDirectory, 0o755)
      symlinkSync(targetDirectory, ipcDirectory, "dir")

      return Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => rmSync(testRoot, { recursive: true, force: true })),
        )
        const preparation = yield* Effect.result(prepareRuntimeDirectories)

        expect(Result.isFailure(preparation)).toBe(true)
        expect(lstatSync(ipcDirectory).isSymbolicLink()).toBe(true)
        expect(statSync(targetDirectory).mode & 0o777).toBe(0o755)
      }).pipe(
        Effect.provide(
          Layer.succeed(
            RuntimePaths,
            RuntimePaths.of({
              codexDatabasePath: join(testRoot, "codex.sqlite"),
              packWalkDataDirectory: join(testRoot, "data"),
              legacyPackWalkDatabasePath: join(
                testRoot,
                "data",
                "packwalk.sqlite",
              ),
              packWalkDatabasePath: join(
                testRoot,
                "data",
                "packwalk-v2.sqlite",
              ),
              ipcDirectory,
              ipcEndpoint: join(ipcDirectory, "daemon-v2.sock"),
            }),
          ),
        ),
        Effect.provide(NodeServices.layer),
        Effect.scoped,
      )
    },
  )

  it.effect.skipIf(process.platform === "win32")(
    "creates and re-secures an owned Unix endpoint directory with private permissions",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-ipc-private-test-"))
      const dataDirectory = join(testRoot, "data")
      const ipcDirectory = join(testRoot, "predictable-ipc-leaf")
      mkdirSync(dataDirectory, { mode: 0o777 })
      chmodSync(dataDirectory, 0o777)
      const runtimePaths = RuntimePaths.of({
        codexDatabasePath: join(testRoot, "codex.sqlite"),
        packWalkDataDirectory: dataDirectory,
        legacyPackWalkDatabasePath: join(
          testRoot,
          "data",
          "packwalk.sqlite",
        ),
        packWalkDatabasePath: join(
          testRoot,
          "data",
          "packwalk-v2.sqlite",
        ),
        ipcDirectory,
        ipcEndpoint: join(ipcDirectory, "daemon-v2.sock"),
      })

      return Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => rmSync(testRoot, { recursive: true, force: true })),
        )
        yield* prepareRuntimeDirectories

        const created = lstatSync(ipcDirectory)
        expect(created.isDirectory()).toBe(true)
        expect(created.isSymbolicLink()).toBe(false)
        expect(created.uid).toBe(process.getuid?.())
        expect(created.mode & 0o777).toBe(0o700)
        expect(lstatSync(dataDirectory).mode & 0o777).toBe(0o700)

        chmodSync(ipcDirectory, 0o777)
        yield* prepareRuntimeDirectories

        expect(lstatSync(ipcDirectory).mode & 0o777).toBe(0o700)
      }).pipe(
        Effect.provide(Layer.succeed(RuntimePaths, runtimePaths)),
        Effect.provide(NodeServices.layer),
        Effect.scoped,
      )
    },
  )

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

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer, Result } from "effect"

import {
  type DurableDatabaseAuthority,
  deriveRuntimePaths,
  identifyNativeDurablePath,
  prepareRuntimeDirectories,
  RuntimePaths,
  type RuntimePathInputs,
  runtimePathsLayer,
  verifyRuntimeAuthority,
} from "../src/adapters/runtime-paths.js"

const databaseAuthority = (
  fileId: bigint = 1n,
  databaseName = "packwalk-v2.sqlite",
): DurableDatabaseAuthority => ({
  deviceId: 1n,
  fileId,
  databaseName,
  targetKind: "directory",
})

const identifyAs = (authority: DurableDatabaseAuthority) => () => authority
const identifyTestDatabase = identifyAs(databaseAuthority())

describe("PackWalk runtime paths", () => {
  it("uses per-user local data and a Unix socket on macOS", () => {
    const paths = deriveRuntimePaths(
      {
        platform: "darwin",
        homeDirectory: "/Users/example",
      },
      identifyTestDatabase,
    )

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
    const paths = deriveRuntimePaths(
      {
        platform: "linux",
        homeDirectory: "/home/example",
        xdgDataHome: "/home/example/.data",
        codexHome: "/home/example/codex-home",
      },
      identifyTestDatabase,
    )

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
    const paths = deriveRuntimePaths(
      {
        platform: "win32",
        homeDirectory: "C:\\Users\\example",
        localAppData: "D:\\LocalData",
        codexHome: "D:\\Codex",
      },
      identifyTestDatabase,
    )

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
    const first = deriveRuntimePaths(
      {
        platform: "linux",
        homeDirectory: "/home/example",
        xdgDataHome: "/home/example/.data",
      },
      identifyAs(databaseAuthority(1n)),
    )
    const sameDatabase = deriveRuntimePaths(
      {
        platform: "linux",
        homeDirectory: "/different/launch-home",
        xdgDataHome: "/home/example/.data",
      },
      identifyAs(databaseAuthority(1n)),
    )
    const differentDatabase = deriveRuntimePaths(
      {
        platform: "linux",
        homeDirectory: "/home/example",
        xdgDataHome: "/home/example/other-data",
      },
      identifyAs(databaseAuthority(2n)),
    )

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
    const first = deriveRuntimePaths(
      {
        platform: "win32",
        homeDirectory: "C:\\Users\\example",
        localAppData: "D:\\LocalData",
      },
      identifyAs(databaseAuthority(1n, "PACKWALK-V2.SQLITE")),
    )
    const sameDatabase = deriveRuntimePaths(
      {
        platform: "win32",
        homeDirectory: "C:\\DifferentHome",
        localAppData: "d:/localdata",
      },
      identifyAs(databaseAuthority(1n, "packwalk-v2.sqlite")),
    )
    const differentDatabase = deriveRuntimePaths(
      {
        platform: "win32",
        homeDirectory: "C:\\Users\\example",
        localAppData: "E:\\LocalData",
      },
      identifyAs(databaseAuthority(2n)),
    )

    expect(sameDatabase.ipcEndpoint).toBe(first.ipcEndpoint)
    expect(differentDatabase.ipcEndpoint).not.toBe(first.ipcEndpoint)
  })

  it.each(["darwin", "linux", "win32"] as const)(
    "derives $platform endpoints from injected native object identity",
    (platform) => {
      const inputFor = (root: string): RuntimePathInputs =>
        platform === "win32"
          ? {
              platform,
              homeDirectory: "C:\\Users\\example",
              localAppData: `C:\\${root}\\LocalData`,
            }
          : platform === "darwin"
            ? { platform, homeDirectory: `/Users/${root}` }
            : {
                platform,
                homeDirectory: `/home/${root}`,
                xdgDataHome: `/data/${root}`,
              }

      const first = deriveRuntimePaths(
        inputFor("first"),
        identifyAs(databaseAuthority(10n)),
      )
      const aliased = deriveRuntimePaths(
        inputFor("alias"),
        identifyAs(databaseAuthority(10n)),
      )
      const distinct = deriveRuntimePaths(
        inputFor("distinct"),
        identifyAs(databaseAuthority(11n)),
      )

      expect(aliased.packWalkDatabasePath).not.toBe(
        first.packWalkDatabasePath,
      )
      expect(aliased.ipcEndpoint).toBe(first.ipcEndpoint)
      expect(distinct.ipcEndpoint).not.toBe(first.ipcEndpoint)
    },
  )

  it("rejects an unavailable injected filesystem identity", () => {
    expect(() =>
      deriveRuntimePaths(
        {
          platform: "linux",
          homeDirectory: "/home/example",
        },
        identifyAs({ ...databaseAuthority(), fileId: 0n }),
      ),
    ).toThrow("Native directory identity is unavailable")
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
          identifyNativeDurablePath,
        )
        const aliasedBeforeCreation = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/different/launch-home",
            xdgDataHome: directoryAlias,
          },
          identifyNativeDurablePath,
        )

        expect(aliasedBeforeCreation.packWalkDatabasePath).not.toBe(
          physicalBeforeCreation.packWalkDatabasePath,
        )
        expect(aliasedBeforeCreation.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )

        writeFileSync(physicalBeforeCreation.packWalkDatabasePath, "database")
        const physicalAfterCreation = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/home/example",
            xdgDataHome: physicalDataRoot,
          },
          identifyNativeDurablePath,
        )
        expect(physicalAfterCreation.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )

        const replacementPath = join(
          physicalDataRoot,
          "packwalk",
          "replacement.sqlite",
        )
        writeFileSync(replacementPath, "replacement")
        renameSync(replacementPath, physicalBeforeCreation.packWalkDatabasePath)
        const physicalAfterReplacement = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/home/example",
            xdgDataHome: physicalDataRoot,
          },
          identifyNativeDurablePath,
        )
        expect(physicalAfterReplacement.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )

        const directorySymlinkDataRoot = join(
          testRoot,
          "directory-symlink-data",
        )
        mkdirSync(directorySymlinkDataRoot)
        symlinkSync(
          join(physicalDataRoot, "packwalk"),
          join(directorySymlinkDataRoot, "packwalk"),
          "dir",
        )
        const aliasedPackWalkDirectory = deriveRuntimePaths(
          {
            platform: "linux",
            homeDirectory: "/directory-symlink-home",
            xdgDataHome: directorySymlinkDataRoot,
          },
          identifyNativeDurablePath,
        )
        expect(aliasedPackWalkDirectory.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )

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
          identifyNativeDurablePath,
        )

        expect(
          readFileSync(aliasedExistingFile.packWalkDatabasePath, "utf8"),
        ).toBe("replacement")
        expect(aliasedExistingFile.ipcEndpoint).toBe(
          physicalBeforeCreation.ipcEndpoint,
        )
      } finally {
        rmSync(testRoot, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(
    process.platform !== "darwin" ||
      !existsSync(`/System/Volumes/Data${homedir()}`),
  )(
    "uses one endpoint for native macOS firmlink spellings of one database authority",
    () => {
      const physicalHome = mkdtempSync(
        join(homedir(), ".packwalk-firmlink-test-"),
      )

      try {
        const physicalDataRoot = join(
          physicalHome,
          "Library",
          "Application Support",
        )
        mkdirSync(physicalDataRoot, { recursive: true })
        const firmlinkHome = `/System/Volumes/Data${physicalHome}`
        const firmlinkDataRoot = join(
          firmlinkHome,
          "Library",
          "Application Support",
        )

        const physicalIdentity = statSync(physicalDataRoot)
        const firmlinkIdentity = statSync(firmlinkDataRoot)
        expect({
          device: firmlinkIdentity.dev,
          inode: firmlinkIdentity.ino,
        }).toEqual({
          device: physicalIdentity.dev,
          inode: physicalIdentity.ino,
        })

        const physical = deriveRuntimePaths(
          { platform: "darwin", homeDirectory: physicalHome },
          identifyNativeDurablePath,
        )
        const firmlink = deriveRuntimePaths(
          { platform: "darwin", homeDirectory: firmlinkHome },
          identifyNativeDurablePath,
        )

        expect(firmlink.packWalkDatabasePath).not.toBe(
          physical.packWalkDatabasePath,
        )
        expect(firmlink.ipcEndpoint).toBe(physical.ipcEndpoint)
      } finally {
        rmSync(physicalHome, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(process.platform === "win32")(
    "rejects a dangling final database symlink instead of using its spelling",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-dangling-db-test-"))
      const databasePath = join(
        testRoot,
        "packwalk",
        "packwalk-v2.sqlite",
      )
      mkdirSync(join(testRoot, "packwalk"))
      symlinkSync(join(testRoot, "missing.sqlite"), databasePath, "file")

      try {
        expect(() => identifyNativeDurablePath(databasePath)).toThrow()
      } finally {
        rmSync(testRoot, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(process.platform === "win32")(
    "rejects a final database symlink into a shared parent without changing it",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-shared-db-test-"))
      const sharedDirectory = join(testRoot, "shared")
      const targetDatabasePath = join(sharedDirectory, "packwalk-v2.sqlite")
      const databasePath = join(
        testRoot,
        "packwalk",
        "packwalk-v2.sqlite",
      )
      mkdirSync(sharedDirectory, { mode: 0o777 })
      chmodSync(sharedDirectory, 0o777)
      writeFileSync(targetDatabasePath, "database")
      mkdirSync(join(testRoot, "packwalk"))
      symlinkSync(targetDatabasePath, databasePath, "file")

      try {
        expect(() => identifyNativeDurablePath(databasePath)).toThrow(
          "Durable database authority is not private",
        )
        expect(statSync(sharedDirectory).mode & 0o777).toBe(0o777)
      } finally {
        rmSync(testRoot, { recursive: true, force: true })
      }
    },
  )

  it.effect.skipIf(process.platform === "win32")(
    "fails verification when the prepared database directory identity changes",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-authority-swap-test-"))
      const dataRoot = join(testRoot, "data")
      mkdirSync(dataRoot)
      const paths = deriveRuntimePaths(
        {
          platform: "linux",
          homeDirectory: "/home/example",
          xdgDataHome: dataRoot,
        },
        identifyNativeDurablePath,
      )
      const previousDataDirectory = join(testRoot, "previous-packwalk")
      renameSync(paths.packWalkDataDirectory, previousDataDirectory)

      return Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => rmSync(testRoot, { recursive: true, force: true })),
        )
        const failure = yield* verifyRuntimeAuthority(paths).pipe(Effect.flip)

        expect(failure).toMatchObject({
          _tag: "PackWalk.RuntimePathError",
          message: "PackWalk database authority changed",
        })
        expect(existsSync(paths.packWalkDataDirectory)).toBe(false)
      }).pipe(Effect.scoped)
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
              packWalkDatabaseAuthority: databaseAuthority(),
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
        packWalkDatabaseAuthority: databaseAuthority(),
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
        deriveRuntimePaths(
          {
            platform,
            homeDirectory:
              platform === "win32"
                ? "C:\\Users\\example"
                : "/home/example",
            ...input,
          },
          identifyTestDatabase,
        ),
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

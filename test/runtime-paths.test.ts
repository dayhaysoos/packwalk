import {
  chmodSync,
  existsSync,
  linkSync,
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
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Exit, Layer, Result } from "effect"

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
import { layer as sqliteSessionStorageLayer } from "../src/adapters/sqlite-session-storage.js"

const databaseAuthority = (
  fileId: bigint = 1n,
  databaseName = "packwalk-v2.sqlite",
  directoryPath = "/durable/packwalk",
): DurableDatabaseAuthority => ({
  deviceId: 1n,
  fileId,
  databaseName,
  directoryPath,
  targetKind: "directory",
})

const identifyAs = (authority: DurableDatabaseAuthority) => () => authority
const identifyTestDatabase = identifyAs(databaseAuthority())
const nativeTempDirectory =
  process.platform === "darwin" ? "/private/tmp" : tmpdir()

const nativeRuntimeInput = (root: string): RuntimePathInputs => {
  switch (process.platform) {
    case "darwin":
      return { platform: "darwin", homeDirectory: root }
    case "linux":
      return {
        platform: "linux",
        homeDirectory: root,
        xdgDataHome: root,
      }
    case "win32":
      return {
        platform: "win32",
        homeDirectory: root,
        localAppData: root,
      }
    default:
      throw new Error("Unsupported test platform")
  }
}

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

  it("keeps the Unix client endpoint independent of durable path length", () => {
    const authorityDirectory = `/${"a".repeat(103)}`
    const paths = deriveRuntimePaths(
      {
        platform: "linux",
        homeDirectory: "/home/example",
      },
      identifyAs(
        databaseAuthority(
          1n,
          "packwalk-v2.sqlite",
          authorityDirectory,
        ),
      ),
    )

    expect(paths.ipcEndpoint.length).toBeLessThan(100)
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
      identifyAs(
        databaseAuthority(
          1n,
          "packwalk-v2.sqlite",
          "D:\\LocalData\\PackWalk",
        ),
      ),
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

  it.effect(
    "rejects hard-linked database entries during resolution and revalidation",
    () => {
      const firstRoot = mkdtempSync(join(nativeTempDirectory, "pw-ha-"))
      const secondRoot = mkdtempSync(join(nativeTempDirectory, "pw-hb-"))

      return Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            rmSync(firstRoot, { recursive: true, force: true })
            rmSync(secondRoot, { recursive: true, force: true })
          }),
        )
        const firstPaths = deriveRuntimePaths(
          nativeRuntimeInput(firstRoot),
          identifyNativeDurablePath,
        )
        const secondPaths = deriveRuntimePaths(
          nativeRuntimeInput(secondRoot),
          identifyNativeDurablePath,
        )
        writeFileSync(firstPaths.packWalkDatabasePath, "database")
        linkSync(
          firstPaths.packWalkDatabasePath,
          secondPaths.packWalkDatabasePath,
        )

        const firstEntry = statSync(firstPaths.packWalkDatabasePath)
        const secondEntry = statSync(secondPaths.packWalkDatabasePath)
        expect(firstPaths.ipcEndpoint).not.toBe(secondPaths.ipcEndpoint)
        expect({
          deviceId: firstEntry.dev,
          fileId: firstEntry.ino,
          linkCount: firstEntry.nlink,
        }).toEqual({
          deviceId: secondEntry.dev,
          fileId: secondEntry.ino,
          linkCount: 2,
        })
        expect(() =>
          identifyNativeDurablePath(firstPaths.packWalkDatabasePath),
        ).toThrow("Durable database must have exactly one link")
        expect(() =>
          identifyNativeDurablePath(secondPaths.packWalkDatabasePath),
        ).toThrow("Durable database must have exactly one link")

        const failure = yield* verifyRuntimeAuthority(firstPaths).pipe(
          Effect.flip,
        )
        expect(failure).toMatchObject({
          _tag: "PackWalk.RuntimePathError",
          message: "PackWalk database authority changed",
        })
      }).pipe(Effect.scoped)
    },
  )

  it.skipIf(process.platform === "win32")(
    "uses one endpoint for physical database aliases before and after the database exists",
    () => {
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-pa-"))

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

  it.effect.skipIf(
    process.platform !== "darwin" ||
      !existsSync("/System/Volumes/Data/private/tmp"),
  )(
    "uses one writer authority through native macOS firmlink spellings",
    () => {
      const physicalHome = mkdtempSync("/private/tmp/pw-f-")

      return Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => rmSync(physicalHome, { recursive: true, force: true })),
        )
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
        yield* Layer.build(
          sqliteSessionStorageLayer(physical.packWalkDatabasePath),
        )
        const competing = yield* Effect.promise(() =>
          Effect.runPromiseExit(
            Effect.scoped(
              Layer.build(
                Layer.fresh(
                  sqliteSessionStorageLayer(
                    firmlink.packWalkDatabasePath,
                  ),
                ),
              ),
            ),
          ),
        )
        expect(Exit.isFailure(competing)).toBe(true)
      }).pipe(Effect.provide(NodeServices.layer))
    },
  )

  it.skipIf(process.platform === "win32")(
    "rejects a dangling final database symlink instead of using its spelling",
    () => {
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-dd-"))
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
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-sd-"))
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
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-as-"))
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
    "rejects a replaced data directory before preparation mutates its target",
    () => {
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-ps-"))
      const dataRoot = join(testRoot, "data")
      const unrelatedDirectory = join(testRoot, "unrelated")
      mkdirSync(dataRoot)
      mkdirSync(unrelatedDirectory, { mode: 0o755 })
      chmodSync(unrelatedDirectory, 0o755)
      const paths = deriveRuntimePaths(
        {
          platform: "linux",
          homeDirectory: "/home/example",
          xdgDataHome: dataRoot,
        },
        identifyNativeDurablePath,
      )
      renameSync(
        paths.packWalkDataDirectory,
        join(testRoot, "previous-packwalk"),
      )
      symlinkSync(
        unrelatedDirectory,
        paths.packWalkDataDirectory,
        "dir",
      )

      return Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => rmSync(testRoot, { recursive: true, force: true })),
        )
        const launch = yield* Effect.result(
          Effect.gen(function* () {
            yield* prepareRuntimeDirectories
            yield* verifyRuntimeAuthority(paths)
          }),
        )

        expect(Result.isFailure(launch)).toBe(true)
        expect(lstatSync(paths.packWalkDataDirectory).isSymbolicLink()).toBe(
          true,
        )
        expect(statSync(unrelatedDirectory).mode & 0o777).toBe(0o755)
      }).pipe(
        Effect.provide(Layer.succeed(RuntimePaths, RuntimePaths.of(paths))),
        Effect.provide(NodeServices.layer),
        Effect.scoped,
      )
    },
  )

  it.effect.skipIf(process.platform === "win32")(
    "rejects a symlinked Unix endpoint directory without changing its target",
    () => {
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-is-"))
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
    "creates and re-secures an owned Unix endpoint after data authority is prepared",
    () => {
      const testRoot = mkdtempSync(join(nativeTempDirectory, "pw-ip-"))
      const dataDirectory = join(testRoot, "data")
      const ipcDirectory = join(testRoot, "predictable-ipc-leaf")
      mkdirSync(dataDirectory, { mode: 0o700 })
      chmodSync(dataDirectory, 0o700)
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

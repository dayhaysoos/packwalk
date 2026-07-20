import { createHash } from "node:crypto"
import {
  closeSync,
  constants as fileSystemConstants,
  fchmodSync,
  fstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from "node:fs"
import { homedir } from "node:os"
import {
  basename,
  dirname,
  join as nativeJoin,
  posix,
  win32,
} from "node:path"

import {
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schema,
} from "effect"

export interface RuntimePathInputs {
  readonly platform: "darwin" | "linux" | "win32"
  readonly homeDirectory: string
  readonly codexHome?: string
  readonly localAppData?: string
  readonly xdgDataHome?: string
}

export interface RuntimePathsValue {
  readonly codexDatabasePath: string
  readonly packWalkDataDirectory: string
  readonly legacyPackWalkDatabasePath: string
  readonly packWalkDatabasePath: string
  readonly ipcDirectory?: string
  readonly ipcEndpoint: string
}

// Incompatible command/event protocols use distinct endpoints so a newly
// installed client cannot silently connect to a persistent older daemon.
const sessionIpcNamespace = "v2"

export type DurablePathCanonicalizer = (path: string) => string

const nodeErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined

/**
 * Resolves the physical identity of an existing path, or resolves its nearest
 * existing ancestor before restoring the missing suffix. This keeps endpoint
 * authority stable while SQLite creates a database beneath an aliased data
 * directory.
 */
export const canonicalizeNativeDurablePath: DurablePathCanonicalizer = (
  path,
) => {
  const missingSegments: Array<string> = []
  let candidate = path

  while (true) {
    try {
      return nativeJoin(realpathSync.native(candidate), ...missingSegments)
    } catch (error) {
      if (nodeErrorCode(error) !== "ENOENT") {
        throw error
      }

      const parent = dirname(candidate)
      if (parent === candidate) {
        throw error
      }

      missingSegments.unshift(basename(candidate))
      candidate = parent
    }
  }
}

const durableDatabaseToken = (
  path: string,
  platform: RuntimePathInputs["platform"],
): string => {
  const normalized =
    platform === "win32"
      ? win32.normalize(path).toLowerCase()
      : posix.normalize(path)

  return createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 24)
}

export const deriveRuntimePaths = (
  input: RuntimePathInputs,
  canonicalizeDurablePath: DurablePathCanonicalizer = (path) => path,
): RuntimePathsValue => {
  const path = input.platform === "win32" ? win32 : posix

  const requireAbsoluteOverride = (value: string | undefined): void => {
    if (value !== undefined && !path.isAbsolute(value)) {
      throw new Error("Runtime path overrides must be absolute")
    }
  }

  requireAbsoluteOverride(input.codexHome)
  if (input.platform === "win32") {
    requireAbsoluteOverride(input.localAppData)
  } else {
    if (input.platform === "linux") {
      requireAbsoluteOverride(input.xdgDataHome)
    }
  }

  const codexHome = input.codexHome ?? path.join(input.homeDirectory, ".codex")

  if (input.platform === "win32") {
    const dataRoot =
      input.localAppData ??
      win32.join(input.homeDirectory, "AppData", "Local")
    const packWalkDataDirectory = win32.join(dataRoot, "PackWalk")
    const packWalkDatabasePath = win32.join(
      packWalkDataDirectory,
      "packwalk-v2.sqlite",
    )
    const databaseToken = durableDatabaseToken(
      canonicalizeDurablePath(packWalkDatabasePath),
      input.platform,
    )
    return {
      codexDatabasePath: win32.join(codexHome, "state_5.sqlite"),
      packWalkDataDirectory,
      legacyPackWalkDatabasePath: win32.join(
        packWalkDataDirectory,
        "packwalk.sqlite",
      ),
      packWalkDatabasePath,
      ipcEndpoint: `\\\\.\\pipe\\packwalk-${sessionIpcNamespace}-${databaseToken}`,
    }
  }

  const dataRoot =
    input.platform === "darwin"
      ? posix.join(input.homeDirectory, "Library", "Application Support")
      : input.xdgDataHome ??
        posix.join(input.homeDirectory, ".local", "share")
  const packWalkDataDirectory = posix.join(
    dataRoot,
    input.platform === "darwin" ? "PackWalk" : "packwalk",
  )
  const packWalkDatabasePath = posix.join(
    packWalkDataDirectory,
    "packwalk-v2.sqlite",
  )
  const databaseToken = durableDatabaseToken(
    canonicalizeDurablePath(packWalkDatabasePath),
    input.platform,
  )
  const ipcDirectory = posix.join(
    "/tmp",
    `packwalk-${sessionIpcNamespace}-${databaseToken}`,
  )

  return {
    codexDatabasePath: posix.join(codexHome, "state_5.sqlite"),
    packWalkDataDirectory,
    legacyPackWalkDatabasePath: posix.join(
      packWalkDataDirectory,
      "packwalk.sqlite",
    ),
    packWalkDatabasePath,
    ipcDirectory,
    ipcEndpoint: posix.join(
      ipcDirectory,
      `daemon-${sessionIpcNamespace}.sock`,
    ),
  }
}

export class RuntimePathError extends Schema.TaggedErrorClass<RuntimePathError>()(
  "PackWalk.RuntimePathError",
  { message: Schema.String },
) {}

export class RuntimePaths extends Context.Service<
  RuntimePaths,
  RuntimePathsValue
>()("@packwalk/RuntimePaths") {}

const supportedPlatform = (
  platform: NodeJS.Platform,
): platform is RuntimePathInputs["platform"] =>
  platform === "darwin" || platform === "linux" || platform === "win32"

const resolveRuntimePaths = Effect.gen(function* () {
  const codexHome = yield* Config.option(Config.nonEmptyString("CODEX_HOME"))
  const localAppData = yield* Config.option(
    Config.nonEmptyString("LOCALAPPDATA"),
  )
  const xdgDataHome = yield* Config.option(
    Config.nonEmptyString("XDG_DATA_HOME"),
  )
  return yield* Effect.try({
    try: () => {
      if (!supportedPlatform(process.platform)) {
        throw new Error("Unsupported operating system")
      }

      return RuntimePaths.of(
        deriveRuntimePaths(
          {
            platform: process.platform,
            homeDirectory: homedir(),
            ...(Option.isSome(codexHome)
              ? { codexHome: codexHome.value }
              : {}),
            ...(Option.isSome(localAppData)
              ? { localAppData: localAppData.value }
              : {}),
            ...(Option.isSome(xdgDataHome)
              ? { xdgDataHome: xdgDataHome.value }
              : {}),
          },
          canonicalizeNativeDurablePath,
        ),
      )
    },
    catch: (error) => error,
  })
}).pipe(
  Effect.mapError(
    () =>
      new RuntimePathError({
        message: "PackWalk could not resolve local runtime paths",
      }),
  ),
)

export const runtimePathsLayer = Layer.effect(RuntimePaths, resolveRuntimePaths)

const securePrivateUnixDirectory = (
  directory: string,
  currentUid: number,
): void => {
  try {
    mkdirSync(directory, { mode: 0o700 })
  } catch (error) {
    if (nodeErrorCode(error) !== "EEXIST") {
      throw error
    }
  }

  const descriptor = openSync(
    directory,
    fileSystemConstants.O_RDONLY |
      fileSystemConstants.O_DIRECTORY |
      fileSystemConstants.O_NOFOLLOW,
  )

  try {
    const opened = fstatSync(descriptor)
    if (!opened.isDirectory() || opened.uid !== currentUid) {
      throw new Error("Unsafe Unix endpoint directory")
    }

    if ((opened.mode & 0o777) !== 0o700) {
      fchmodSync(descriptor, 0o700)
    }

    const secured = fstatSync(descriptor)
    if (
      !secured.isDirectory() ||
      secured.uid !== currentUid ||
      (secured.mode & 0o777) !== 0o700
    ) {
      throw new Error("Unsafe Unix endpoint directory")
    }
  } finally {
    closeSync(descriptor)
  }
}

export const prepareRuntimeDirectories = Effect.gen(function* () {
  const paths = yield* RuntimePaths
  const fileSystem = yield* FileSystem.FileSystem

  yield* fileSystem.makeDirectory(paths.packWalkDataDirectory, {
    recursive: true,
    mode: 0o700,
  })

  const ipcDirectory = paths.ipcDirectory
  if (ipcDirectory !== undefined) {
    yield* fileSystem.chmod(paths.packWalkDataDirectory, 0o700)
    yield* Effect.try({
      try: () => {
        if (process.getuid === undefined) {
          throw new Error("Unix user identity is unavailable")
        }

        securePrivateUnixDirectory(ipcDirectory, process.getuid())
      },
      catch: () =>
        new RuntimePathError({
          message: "PackWalk could not secure its local runtime directory",
        }),
    })
  }
})

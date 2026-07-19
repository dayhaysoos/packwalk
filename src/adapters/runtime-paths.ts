import { createHash } from "node:crypto"
import { homedir, tmpdir } from "node:os"
import { posix, win32 } from "node:path"

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
  readonly tempDirectory: string
  readonly userId?: string
  readonly codexHome?: string
  readonly localAppData?: string
  readonly xdgDataHome?: string
  readonly xdgRuntimeDirectory?: string
}

export interface RuntimePathsValue {
  readonly codexDatabasePath: string
  readonly packWalkDataDirectory: string
  readonly packWalkDatabasePath: string
  readonly ipcDirectory?: string
  readonly ipcEndpoint: string
}

const stableUserToken = (input: RuntimePathInputs): string =>
  input.userId ??
  createHash("sha256")
    .update(input.homeDirectory.toLowerCase())
    .digest("hex")
    .slice(0, 16)

export const deriveRuntimePaths = (
  input: RuntimePathInputs,
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
    requireAbsoluteOverride(input.xdgRuntimeDirectory)
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
    return {
      codexDatabasePath: win32.join(codexHome, "state_5.sqlite"),
      packWalkDataDirectory,
      packWalkDatabasePath: win32.join(
        packWalkDataDirectory,
        "packwalk.sqlite",
      ),
      ipcEndpoint: `\\\\.\\pipe\\packwalk-${stableUserToken(input)}`,
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
  const ipcDirectory = posix.join(
    input.xdgRuntimeDirectory ?? input.tempDirectory,
    `packwalk-${stableUserToken(input)}`,
  )

  return {
    codexDatabasePath: posix.join(codexHome, "state_5.sqlite"),
    packWalkDataDirectory,
    packWalkDatabasePath: posix.join(
      packWalkDataDirectory,
      "packwalk.sqlite",
    ),
    ipcDirectory,
    ipcEndpoint: posix.join(ipcDirectory, "daemon.sock"),
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
  const xdgRuntimeDirectory = yield* Config.option(
    Config.nonEmptyString("XDG_RUNTIME_DIR"),
  )

  return yield* Effect.try({
    try: () => {
      if (!supportedPlatform(process.platform)) {
        throw new Error("Unsupported operating system")
      }

      return RuntimePaths.of(
        deriveRuntimePaths({
          platform: process.platform,
          homeDirectory: homedir(),
          tempDirectory: tmpdir(),
          ...(typeof process.getuid === "function"
            ? { userId: String(process.getuid()) }
            : {}),
          ...(Option.isSome(codexHome)
            ? { codexHome: codexHome.value }
            : {}),
          ...(Option.isSome(localAppData)
            ? { localAppData: localAppData.value }
            : {}),
          ...(Option.isSome(xdgDataHome)
            ? { xdgDataHome: xdgDataHome.value }
            : {}),
          ...(Option.isSome(xdgRuntimeDirectory)
            ? { xdgRuntimeDirectory: xdgRuntimeDirectory.value }
            : {}),
        }),
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

export const prepareRuntimeDirectories = Effect.gen(function* () {
  const paths = yield* RuntimePaths
  const fileSystem = yield* FileSystem.FileSystem

  yield* fileSystem.makeDirectory(paths.packWalkDataDirectory, {
    recursive: true,
    mode: 0o700,
  })

  if (paths.ipcDirectory !== undefined) {
    yield* fileSystem.chmod(paths.packWalkDataDirectory, 0o700)
    yield* fileSystem.makeDirectory(paths.ipcDirectory, {
      recursive: true,
      mode: 0o700,
    })
    yield* fileSystem.chmod(paths.ipcDirectory, 0o700)
  }
})

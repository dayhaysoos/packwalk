import { createHash } from "node:crypto"
import {
  type BigIntStats,
  closeSync,
  constants as fileSystemConstants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  statfsSync,
  statSync,
} from "node:fs"
import { homedir } from "node:os"
import {
  basename,
  dirname,
  posix,
  win32,
} from "node:path"

import {
  Config,
  Context,
  Effect,
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
  readonly packWalkDatabaseAuthority: DurableDatabaseAuthority
  readonly ipcDirectory?: string
  readonly ipcEndpoint: string
}

export interface DurableDatabaseAuthority {
  readonly deviceId: bigint
  readonly fileId: bigint
  readonly databaseName: string
  readonly directoryPath: string
  readonly targetKind: "directory"
}

// Incompatible command/event protocols use distinct endpoints so a newly
// installed client cannot silently connect to a persistent older daemon.
const sessionIpcNamespace = "v2"

const qualifiedLocalLinuxFileSystemTypes = new Set([
  0x0000_3434n, // NILFS2
  0x0000_4d44n, // FAT
  0x0000_ef53n, // ext2, ext3, ext4
  0x0001_1954n, // UFS
  0x0102_1994n, // tmpfs
  0x2011_bab0n, // exFAT
  0x2405_1905n, // UBIFS
  0x2fc1_2fc1n, // ZFS
  0x3153_464an, // JFS
  0x5265_4973n, // ReiserFS
  0x5846_5342n, // XFS
  0x7366_746en, // NTFS
  0x8584_58f6n, // ramfs
  0x9123_683en, // Btrfs
  0xca45_1a4en, // bcachefs
  0xf2f5_2010n, // F2FS
])

export interface LocalStorageFileSystemInput {
  readonly platform: RuntimePathInputs["platform"]
  readonly physicalDirectory: string
  readonly fileSystemType: bigint
}

const isOrdinaryAbsoluteWindowsPath = (path: string): boolean =>
  /^[A-Za-z]:\\/.test(win32.normalize(path))

/** @internal Exported for deterministic cross-platform policy laws. */
export const isQualifiedLocalStorageFileSystem = ({
  platform,
  fileSystemType,
}: LocalStorageFileSystemInput): boolean => {
  if (platform === "win32") {
    // Pinned Node does not expose the native volume type needed to prove that
    // a drive-letter path is not a mapped network share. Ticket 10 must add
    // that positive qualification before release storage can open on Windows.
    return false
  }

  const normalizedType = BigInt.asUintN(32, fileSystemType)
  return platform === "darwin"
    ? normalizedType === 0x1an
    : qualifiedLocalLinuxFileSystemTypes.has(normalizedType)
}

/** @internal Exported for deterministic existing-database authority laws. */
export const isSamePhysicalStorageDevice = (
  databaseDeviceId: bigint,
  parentDeviceId: bigint,
): boolean =>
  databaseDeviceId > 0n &&
  parentDeviceId > 0n &&
  databaseDeviceId === parentDeviceId

export type StorageFileSystemProbe = (
  physicalPath: string,
) => bigint

const probeNativeStorageFileSystem: StorageFileSystemProbe =
  (physicalPath) => statfsSync(physicalPath, { bigint: true }).type

const requireQualifiedLocalStorageFileSystem = (
  physicalPath: string,
  platform: RuntimePathInputs["platform"],
  probe: StorageFileSystemProbe,
): void => {
  const fileSystemType =
    platform === "win32" ? 0n : probe(physicalPath)
  if (
    !isQualifiedLocalStorageFileSystem({
      platform,
      physicalDirectory: physicalPath,
      fileSystemType,
    })
  ) {
    throw new Error(
      "PackWalk storage requires a qualified local filesystem",
    )
  }
}

export type DurablePathIdentifier = (
  path: string,
) => DurableDatabaseAuthority

const nodeErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined

const normalizeDatabaseName = (
  databaseName: string,
  platform: RuntimePathInputs["platform"],
): string =>
  platform === "win32"
    ? win32.normalize(databaseName).toLowerCase()
    : posix.normalize(databaseName)

const requireUsableDirectoryAuthority = (
  authority: Pick<DurableDatabaseAuthority, "deviceId" | "fileId">,
): void => {
  if (authority.deviceId <= 0n || authority.fileId <= 0n) {
    throw new Error("Native directory identity is unavailable")
  }
}

const normalizeDurableDatabaseAuthority = (
  authority: DurableDatabaseAuthority,
  platform: RuntimePathInputs["platform"],
): DurableDatabaseAuthority => {
  requireUsableDirectoryAuthority(authority)
  return {
    ...authority,
    databaseName: normalizeDatabaseName(authority.databaseName, platform),
  }
}

const captureNativeDirectoryAuthority = (
  directory: string,
  databaseName: string,
  probeStorageFileSystem: StorageFileSystemProbe,
  existingDatabaseDeviceId?: bigint,
): DurableDatabaseAuthority => {
  const directoryPath = realpathSync.native(directory)
  if (!supportedPlatform(process.platform)) {
    throw new Error("Unsupported operating system")
  }
  requireQualifiedLocalStorageFileSystem(
    directoryPath,
    process.platform,
    probeStorageFileSystem,
  )
  const normalizedDatabaseName = normalizeDatabaseName(
    databaseName,
    process.platform === "win32" ? "win32" : "linux",
  )

  if (process.platform === "win32") {
    const identity = statSync(directoryPath, { bigint: true })
    if (!identity.isDirectory()) {
      throw new Error("Durable database authority is not a directory")
    }
    if (
      existingDatabaseDeviceId !== undefined &&
      !isSamePhysicalStorageDevice(existingDatabaseDeviceId, identity.dev)
    ) {
      throw new Error(
        "Durable database and parent must share storage authority",
      )
    }
    const authority = {
      deviceId: identity.dev,
      fileId: identity.ino,
      databaseName: normalizedDatabaseName,
      directoryPath,
      targetKind: "directory" as const,
    }
    requireUsableDirectoryAuthority(authority)
    return authority
  }

  const descriptor = openSync(
    directoryPath,
    fileSystemConstants.O_RDONLY |
      fileSystemConstants.O_DIRECTORY |
      fileSystemConstants.O_NOFOLLOW,
  )

  try {
    const identity = fstatSync(descriptor, { bigint: true })
    if (!identity.isDirectory()) {
      throw new Error("Durable database authority is not a directory")
    }
    if (
      process.getuid === undefined ||
      identity.uid !== BigInt(process.getuid()) ||
      (identity.mode & 0o777n) !== 0o700n
    ) {
      throw new Error("Durable database authority is not private")
    }
    if (
      existingDatabaseDeviceId !== undefined &&
      !isSamePhysicalStorageDevice(existingDatabaseDeviceId, identity.dev)
    ) {
      throw new Error(
        "Durable database and parent must share storage authority",
      )
    }
    const authority = {
      deviceId: identity.dev,
      fileId: identity.ino,
      databaseName: normalizedDatabaseName,
      directoryPath,
      targetKind: "directory" as const,
    }
    requireUsableDirectoryAuthority(authority)
    return authority
  } finally {
    closeSync(descriptor)
  }
}

const secureNativePackWalkDataDirectory = (directory: string): void => {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (process.platform === "win32") return
  if (process.getuid === undefined) {
    throw new Error("Unix user identity is unavailable")
  }

  const descriptor = openSync(
    realpathSync.native(directory),
    fileSystemConstants.O_RDONLY |
      fileSystemConstants.O_DIRECTORY |
      fileSystemConstants.O_NOFOLLOW,
  )

  try {
    const opened = fstatSync(descriptor)
    if (!opened.isDirectory() || opened.uid !== process.getuid()) {
      throw new Error("Unsafe PackWalk data directory")
    }

    if ((opened.mode & 0o777) !== 0o700) {
      fchmodSync(descriptor, 0o700)
    }

    const secured = fstatSync(descriptor)
    if (
      !secured.isDirectory() ||
      secured.uid !== process.getuid() ||
      (secured.mode & 0o777) !== 0o700
    ) {
      throw new Error("Unsafe PackWalk data directory")
    }
  } finally {
    closeSync(descriptor)
  }
}

const requireQualifiedSingleLinkDatabaseEntry = (
  path: string,
  probeStorageFileSystem: StorageFileSystemProbe,
): BigIntStats => {
  const entry = statSync(path, { bigint: true })
  if (!entry.isFile() || entry.nlink !== 1n) {
    throw new Error("Durable database must have exactly one link")
  }
  if (!supportedPlatform(process.platform)) {
    throw new Error("Unsupported operating system")
  }
  requireQualifiedLocalStorageFileSystem(
    path,
    process.platform,
    probeStorageFileSystem,
  )
  return entry
}

/** @internal Exported for deterministic revalidation laws. */
export const captureNativeDurablePath = (
  path: string,
  probeStorageFileSystem: StorageFileSystemProbe =
    probeNativeStorageFileSystem,
): DurableDatabaseAuthority => {
  let existingEntry: ReturnType<typeof lstatSync> | undefined
  try {
    existingEntry = lstatSync(path)
  } catch (error) {
    if (nodeErrorCode(error) !== "ENOENT") throw error
  }

  if (existingEntry?.isSymbolicLink() === true) {
    if (process.platform === "win32") {
      throw new Error(
        "Final database symlink authority is unsupported on Windows",
      )
    }
    const resolvedDatabasePath = realpathSync.native(path)
    const databaseEntry = requireQualifiedSingleLinkDatabaseEntry(
      resolvedDatabasePath,
      probeStorageFileSystem,
    )
    return captureNativeDirectoryAuthority(
      dirname(resolvedDatabasePath),
      basename(resolvedDatabasePath),
      probeStorageFileSystem,
      databaseEntry.dev,
    )
  }

  let existingDatabaseDeviceId: bigint | undefined
  if (existingEntry !== undefined) {
    existingDatabaseDeviceId = requireQualifiedSingleLinkDatabaseEntry(
      path,
      probeStorageFileSystem,
    ).dev
  }

  return captureNativeDirectoryAuthority(
    dirname(path),
    basename(path),
    probeStorageFileSystem,
    existingDatabaseDeviceId,
  )
}

/**
 * Prepares and identifies the directory that owns the replaceable SQLite
 * file. Native directory file identity converges symlinks, firmlinks,
 * junctions, and bind mounts without relying on a lexical realpath string. An
 * existing final database symlink uses its private target parent and basename;
 * a dangling or unqualified final symlink fails instead of falling back to its
 * spelling.
 */
export const identifyNativeDurablePath = (
  path: string,
  probeStorageFileSystem: StorageFileSystemProbe =
    probeNativeStorageFileSystem,
): DurableDatabaseAuthority => {
  if (process.platform === "win32") {
    throw new Error(
      "PackWalk storage requires a qualified local filesystem",
    )
  }
  secureNativePackWalkDataDirectory(dirname(path))
  return captureNativeDurablePath(path, probeStorageFileSystem)
}

const durableDatabaseToken = (
  authority: DurableDatabaseAuthority,
  platform: RuntimePathInputs["platform"],
): string =>
  createHash("sha256")
    .update(
      [
        sessionIpcNamespace,
        authority.targetKind,
        authority.deviceId.toString(16),
        authority.fileId.toString(16),
        normalizeDatabaseName(authority.databaseName, platform),
      ].join("\0"),
    )
    .digest("hex")
    .slice(0, 24)

export const deriveRuntimePaths = (
  input: RuntimePathInputs,
  identifyDurablePath: DurablePathIdentifier,
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
    if (!isOrdinaryAbsoluteWindowsPath(dataRoot)) {
      throw new Error(
        "PackWalk storage requires a qualified local filesystem",
      )
    }
    const packWalkDataDirectory = win32.join(dataRoot, "PackWalk")
    const packWalkDatabasePath = win32.join(
      packWalkDataDirectory,
      "packwalk-v2.sqlite",
    )
    const packWalkDatabaseAuthority = normalizeDurableDatabaseAuthority(
      identifyDurablePath(packWalkDatabasePath),
      input.platform,
    )
    const databaseToken = durableDatabaseToken(
      packWalkDatabaseAuthority,
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
      packWalkDatabaseAuthority,
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
  const packWalkDatabaseAuthority = normalizeDurableDatabaseAuthority(
    identifyDurablePath(packWalkDatabasePath),
    input.platform,
  )
  const databaseToken = durableDatabaseToken(
    packWalkDatabaseAuthority,
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
    packWalkDatabaseAuthority,
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

const sameDurableDatabaseAuthority = (
  left: DurableDatabaseAuthority,
  right: DurableDatabaseAuthority,
): boolean =>
  left.deviceId === right.deviceId &&
  left.fileId === right.fileId &&
  left.databaseName === right.databaseName &&
  left.targetKind === right.targetKind

export const verifyRuntimeAuthority = (
  paths: RuntimePathsValue,
  captureDurablePath: DurablePathIdentifier = captureNativeDurablePath,
) =>
  Effect.try({
    try: () => {
      const actualAuthority = captureDurablePath(
        paths.packWalkDatabasePath,
      )
      if (
        !sameDurableDatabaseAuthority(
          paths.packWalkDatabaseAuthority,
          actualAuthority,
        )
      ) {
        throw new Error("PackWalk database authority changed")
      }
    },
    catch: () =>
      new RuntimePathError({
        message: "PackWalk database authority changed",
      }),
  })

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
          identifyNativeDurablePath,
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

  const ipcDirectory = paths.ipcDirectory
  if (ipcDirectory !== undefined) {
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

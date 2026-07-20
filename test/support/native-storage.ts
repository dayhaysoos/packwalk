import { existsSync, realpathSync, statfsSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { isQualifiedLocalStorageFileSystem } from "../../src/adapters/runtime-paths.js"

const nearestExistingPath = (path: string): string => {
  let candidate = resolve(path)
  while (!existsSync(candidate)) {
    const parent = dirname(candidate)
    if (parent === candidate) return candidate
    candidate = parent
  }
  return candidate
}

/** Read-only host qualification for tests that exercise native runtime paths. */
export const isNativeStorageQualified = (path: string): boolean => {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return false
  }

  try {
    const physicalPath = realpathSync.native(nearestExistingPath(path))
    return isQualifiedLocalStorageFileSystem({
      platform: process.platform,
      physicalDirectory: physicalPath,
      fileSystemType: statfsSync(physicalPath, { bigint: true }).type,
    })
  } catch {
    return false
  }
}

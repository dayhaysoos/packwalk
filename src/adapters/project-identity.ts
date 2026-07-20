import { posix, win32 } from "node:path"

import { Effect, FileSystem, Path, Schema } from "effect"

import {
  ProjectIdentity,
  type ProjectIdentity as ProjectIdentityValue,
} from "../domain/session.js"

export interface ProjectIdentityResolver {
  readonly resolve: (
    workingDirectory: string,
  ) => Effect.Effect<ProjectIdentityValue, Schema.SchemaError>
}

export type ProjectIdentityPlatform = "darwin" | "linux" | "win32"

export const projectIdentityComparisonKey = (
  identity: string,
  platform: ProjectIdentityPlatform,
): string =>
  platform === "win32"
    ? win32.normalize(identity).toLowerCase()
    : posix.normalize(identity)

export const makeProjectIdentityResolver = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const resolve = (workingDirectory: string) => {
    const normalizedWorkingDirectory = path.normalize(workingDirectory)

    return (path.isAbsolute(workingDirectory)
      ? Effect.gen(function* () {
          let candidate = normalizedWorkingDirectory

          while (true) {
            if (yield* fileSystem.exists(path.join(candidate, ".git"))) {
              return candidate
            }

            const parent = path.dirname(candidate)
            if (parent === candidate) {
              return normalizedWorkingDirectory
            }
            candidate = parent
          }
        }).pipe(
          Effect.catch(() => Effect.succeed(normalizedWorkingDirectory)),
        )
      : Effect.succeed(normalizedWorkingDirectory)
    ).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ProjectIdentity)),
    )
  }

  return { resolve } satisfies ProjectIdentityResolver
})

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

export const makeProjectIdentityResolver = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const resolve = (workingDirectory: string) =>
    (path.isAbsolute(workingDirectory)
      ? Effect.gen(function* () {
          let candidate = path.normalize(workingDirectory)

          while (true) {
            if (yield* fileSystem.exists(path.join(candidate, ".git"))) {
              return candidate
            }

            const parent = path.dirname(candidate)
            if (parent === candidate) {
              return workingDirectory
            }
            candidate = parent
          }
        }).pipe(Effect.catch(() => Effect.succeed(workingDirectory)))
      : Effect.succeed(workingDirectory)
    ).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(ProjectIdentity)),
    )

  return { resolve } satisfies ProjectIdentityResolver
})

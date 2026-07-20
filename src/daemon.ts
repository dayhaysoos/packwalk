import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"

import {
  prepareRuntimeDirectories,
  RuntimePaths,
  runtimePathsLayer,
  verifyRuntimeAuthority,
} from "./adapters/runtime-paths.js"
import {
  codexSourceLayer,
  layer as sqliteSessionStorageLayer,
  prepareVersionedStorage,
} from "./adapters/sqlite-session-storage.js"
import {
  sessionDaemonLayerFromServer,
  Service as SessionDaemon,
} from "./daemon/session-runtime.js"
import { claimSessionDaemon } from "./daemon/endpoint-ownership.js"

const daemonProgram = Effect.scoped(
  Effect.gen(function* () {
    const paths = yield* RuntimePaths
    yield* prepareRuntimeDirectories
    yield* verifyRuntimeAuthority(paths)

    const endpointClaim = yield* claimSessionDaemon({
      authorityEndpoint: paths.daemonLockEndpoint,
      transportEndpoint: paths.ipcEndpoint,
    })
    yield* verifyRuntimeAuthority(paths)
    if (endpointClaim._tag === "AlreadyRunning") {
      return
    }

    yield* prepareVersionedStorage(
      paths.legacyPackWalkDatabasePath,
      paths.packWalkDatabasePath,
    )

    const dependencies = Layer.mergeAll(
      codexSourceLayer(paths.codexDatabasePath),
      sqliteSessionStorageLayer(paths.packWalkDatabasePath),
    )
    const daemonContext = yield* Layer.build(
      sessionDaemonLayerFromServer(endpointClaim.server).pipe(
        Layer.provide(dependencies),
      ),
    )
    const daemon = Context.get(daemonContext, SessionDaemon)
    yield* verifyRuntimeAuthority(paths)
    return yield* daemon.lifetime
  }),
)

daemonProgram.pipe(
  Effect.provide(Layer.merge(NodeServices.layer, runtimePathsLayer)),
  NodeRuntime.runMain({ disableErrorReporting: true }),
)

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
} from "./adapters/sqlite-session-storage.js"
import { Service as SessionStorage } from "./application/session-storage.js"
import {
  sessionDaemonLayerFromServer,
  Service as SessionDaemon,
} from "./daemon/session-runtime.js"
import { claimSessionDaemonEndpoint } from "./daemon/endpoint-ownership.js"

const daemonProgram = Effect.scoped(
  Effect.gen(function* () {
    const paths = yield* RuntimePaths
    yield* prepareRuntimeDirectories
    yield* verifyRuntimeAuthority(paths)

    const storageContext = yield* Layer.build(
      sqliteSessionStorageLayer(
        paths.packWalkDatabasePath,
        paths.legacyPackWalkDatabasePath,
      ),
    )
    const storage = Context.get(storageContext, SessionStorage)

    const endpointClaim = yield* claimSessionDaemonEndpoint(
      paths.ipcEndpoint,
    )
    yield* verifyRuntimeAuthority(paths)
    if (endpointClaim._tag === "AlreadyRunning") {
      return
    }

    const dependencies = Layer.mergeAll(
      codexSourceLayer(paths.codexDatabasePath),
      Layer.succeed(SessionStorage, storage),
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

import { Context, Effect, FiberSet, Layer } from "effect"

import {
  LocalIpcError,
  makeSessionEventServer,
  runSessionEventServer,
  type SessionEventServer,
} from "../adapters/local-session-ipc.js"
import {
  layer as sessionSurfaceLayer,
  Service as SessionSurface,
} from "../application/session-surface.js"
import type { IllegalSessionTransition } from "../domain/session.js"

export type SessionDaemonFailure = LocalIpcError | IllegalSessionTransition

export interface Interface {
  readonly lifetime: Effect.Effect<never, SessionDaemonFailure>
}

export class Service extends Context.Service<Service, Interface>()(
  "@packwalk/SessionDaemon",
) {}

const makeSessionDaemon = (server: SessionEventServer) =>
  Effect.gen(function* () {
    const surfaceContext = yield* Layer.build(sessionSurfaceLayer)
    const surface = Context.get(surfaceContext, SessionSurface)
    const workers = yield* FiberSet.make<never, SessionDaemonFailure>()

    yield* FiberSet.run(workers, surface.runPolling)
    yield* FiberSet.run(
      workers,
      runSessionEventServer(server, surface.events, surface.refresh),
    )

    return Service.of({
      lifetime: FiberSet.join(workers).pipe(
        Effect.andThen(Effect.never),
      ),
    })
  })

export const sessionDaemonLayerFromServer = (server: SessionEventServer) =>
  Layer.effect(Service, makeSessionDaemon(server))

export const sessionDaemonLayer = (endpoint: string) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const server = yield* makeSessionEventServer(endpoint)
      return yield* makeSessionDaemon(server)
    }),
  )

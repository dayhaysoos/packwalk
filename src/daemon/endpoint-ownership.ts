import * as Net from "node:net"

import { Effect, Result, Scope } from "effect"

import {
  LocalIpcError,
  makeSessionEventServer,
  type SessionEventServer,
} from "../adapters/local-session-ipc.js"

export type SessionDaemonEndpointClaim =
  | {
      readonly _tag: "Owned"
      readonly server: SessionEventServer
    }
  | {
      readonly _tag: "AlreadyRunning"
    }

const endpointAcceptsConnections = (endpoint: string) =>
  Effect.callback<boolean>((resume) => {
    const socket = Net.createConnection({ path: endpoint })
    let settled = false

    const finish = (acceptsConnections: boolean) => {
      if (settled) {
        return
      }
      settled = true
      socket.destroy()
      resume(Effect.succeed(acceptsConnections))
    }

    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.setTimeout(250, () => finish(false))

    return Effect.sync(() => {
      settled = true
      socket.destroy()
    })
  })

/**
 * Uses the local endpoint bind as the daemon's atomic ownership primitive.
 * A failed bind never removes an endpoint: an accepting endpoint belongs to
 * the running daemon, while a non-accepting endpoint fails safely for later
 * recovery work.
 */
export const claimSessionDaemonEndpoint = (
  endpoint: string,
): Effect.Effect<
  SessionDaemonEndpointClaim,
  LocalIpcError,
  Scope.Scope
> =>
  Effect.gen(function* () {
    const claim = yield* Effect.result(makeSessionEventServer(endpoint))
    if (Result.isSuccess(claim)) {
      return { _tag: "Owned", server: claim.success } as const
    }

    if (yield* endpointAcceptsConnections(endpoint)) {
      return { _tag: "AlreadyRunning" } as const
    }

    return yield* claim.failure
  })

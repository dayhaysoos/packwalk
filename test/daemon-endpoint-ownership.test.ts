import { randomUUID } from "node:crypto"
import { once } from "node:events"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { createServer, type Socket } from "node:net"
import { join } from "node:path"

import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Layer, Result, Stream } from "effect"

import { layer as sqliteSessionStorageLayer } from "../src/adapters/sqlite-session-storage.js"
import { claimSessionDaemonEndpoint } from "../src/daemon/endpoint-ownership.js"
import { runSessionEventServer } from "../src/adapters/local-session-ipc.js"

const endpointIn = (directory: string): string =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\packwalk-ownership-test-${randomUUID()}`
    : join(directory, "daemon.sock")

it.effect("rejects an unrelated accepting transport after storage election", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-foreign-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = endpointIn(directory)
    yield* Layer.build(
      sqliteSessionStorageLayer(join(directory, "packwalk.sqlite")),
    )

    const sockets = new Set<Socket>()
    const server = createServer((socket) => {
      sockets.add(socket)
      socket.once("close", () => sockets.delete(socket))
    })
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        for (const socket of sockets) socket.destroy()
        if (!server.listening) return
        const closed = once(server, "close")
        server.close()
        await closed
      }),
    )
    yield* Effect.promise(async () => {
      const listening = once(server, "listening")
      server.listen(endpoint)
      await listening
    })

    const claim = yield* Effect.result(claimSessionDaemonEndpoint(endpoint))

    expect(Result.isFailure(claim)).toBe(true)
    if (Result.isFailure(claim)) {
      expect(claim.failure).toMatchObject({
        _tag: "PackWalk.LocalIpcError",
        code: "transport-unavailable",
        message: "PackWalk could not start its local session service",
      })
    }
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect("elects exactly one daemon endpoint owner when starts compete", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ownership-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = endpointIn(directory)

    const claims = yield* Effect.all(
      [
        Effect.result(claimSessionDaemonEndpoint(endpoint)),
        Effect.result(claimSessionDaemonEndpoint(endpoint)),
      ],
      { concurrency: "unbounded" },
    )

    expect(claims.filter(Result.isSuccess)).toHaveLength(1)
    expect(claims.filter(Result.isFailure)).toHaveLength(1)
    const owner = claims.find(Result.isSuccess)
    if (owner === undefined || Result.isFailure(owner)) {
      return yield* Effect.die("Expected one owned daemon endpoint")
    }
    yield* runSessionEventServer(owner.success, Stream.never).pipe(
      Effect.forkScoped,
    )

    expect(
      Result.isFailure(
        yield* Effect.result(claimSessionDaemonEndpoint(endpoint)),
      ),
    ).toBe(true)
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect.skipIf(process.platform === "win32")(
  "keeps storage single-writer when the transport directory is replaced",
  () =>
    Effect.gen(function* () {
      const testRoot = mkdtempSync(join(tmpdir(), "packwalk-authority-test-"))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => rmSync(testRoot, { recursive: true, force: true })),
      )
      const transportDirectory = join(testRoot, "transport")
      const movedTransportDirectory = join(testRoot, "moved-transport")
      mkdirSync(transportDirectory)
      const storagePath = join(testRoot, "packwalk.sqlite")
      const transportEndpoint = join(transportDirectory, "daemon.sock")
      yield* Layer.build(sqliteSessionStorageLayer(storagePath))

      const first = yield* claimSessionDaemonEndpoint(transportEndpoint)
      yield* runSessionEventServer(first, Stream.never).pipe(
        Effect.forkScoped,
      )

      renameSync(transportDirectory, movedTransportDirectory)
      mkdirSync(transportDirectory)
      expect(
        Result.isSuccess(
          yield* Effect.result(
            claimSessionDaemonEndpoint(transportEndpoint),
          ),
        ),
      ).toBe(true)

      const competingStorage = yield* Effect.promise(() =>
        Effect.runPromiseExit(
          Effect.scoped(
            Layer.build(
              Layer.fresh(sqliteSessionStorageLayer(storagePath)),
            ),
          ),
        ),
      )
      expect(Exit.isFailure(competingStorage)).toBe(true)
    }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect.skipIf(process.platform === "win32")(
  "keeps storage single-writer when a live transport socket is removed",
  () =>
    Effect.gen(function* () {
      const testRoot = mkdtempSync(join(tmpdir(), "pw-unlink-test-"))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => rmSync(testRoot, { recursive: true, force: true })),
      )
      const storagePath = join(testRoot, "packwalk.sqlite")
      const transportEndpoint = join(testRoot, "daemon.sock")
      yield* Layer.build(sqliteSessionStorageLayer(storagePath))
      const first = yield* claimSessionDaemonEndpoint(transportEndpoint)
      yield* runSessionEventServer(first, Stream.never).pipe(
        Effect.forkScoped,
      )

      rmSync(transportEndpoint)

      expect(
        Result.isSuccess(
          yield* Effect.result(
            claimSessionDaemonEndpoint(transportEndpoint),
          ),
        ),
      ).toBe(true)
      const competingStorage = yield* Effect.promise(() =>
        Effect.runPromiseExit(
          Effect.scoped(
            Layer.build(
              Layer.fresh(sqliteSessionStorageLayer(storagePath)),
            ),
          ),
        ),
      )
      expect(Exit.isFailure(competingStorage)).toBe(true)
    }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect.skipIf(process.platform === "win32")(
  "fails safely without removing a stale Unix endpoint",
  () =>
    Effect.gen(function* () {
      const directory = mkdtempSync(join(tmpdir(), "packwalk-stale-test-"))
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
      )
      const endpoint = join(directory, "daemon.sock")
      writeFileSync(endpoint, "stale endpoint")

      const claim = yield* Effect.result(claimSessionDaemonEndpoint(endpoint))

      expect(Result.isFailure(claim)).toBe(true)
      expect(readFileSync(endpoint, "utf8")).toBe("stale endpoint")
    }).pipe(Effect.provide(NodeServices.layer)),
)

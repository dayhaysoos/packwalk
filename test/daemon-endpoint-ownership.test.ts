import { randomUUID } from "node:crypto"
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, it } from "@effect/vitest"
import { NodeServices } from "@effect/platform-node"
import { Effect, Result, Stream } from "effect"

import { claimSessionDaemonEndpoint } from "../src/daemon/endpoint-ownership.js"
import { runSessionEventServer } from "../src/adapters/local-session-ipc.js"

const endpointIn = (directory: string): string =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\packwalk-ownership-test-${randomUUID()}`
    : join(directory, "daemon.sock")

it.effect("elects exactly one daemon endpoint owner when starts compete", () =>
  Effect.gen(function* () {
    const directory = mkdtempSync(join(tmpdir(), "packwalk-ownership-test-"))
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
    )
    const endpoint = endpointIn(directory)

    const claims = yield* Effect.all(
      [
        claimSessionDaemonEndpoint(endpoint),
        claimSessionDaemonEndpoint(endpoint),
      ],
      { concurrency: "unbounded" },
    )

    expect(claims.filter((claim) => claim._tag === "Owned")).toHaveLength(1)
    expect(
      claims.filter((claim) => claim._tag === "AlreadyRunning"),
    ).toHaveLength(1)
    const owner = claims.find((claim) => claim._tag === "Owned")
    if (owner?._tag !== "Owned") {
      return yield* Effect.die("Expected one owned daemon endpoint")
    }
    yield* runSessionEventServer(owner.server, Stream.never).pipe(
      Effect.forkScoped,
    )

    expect((yield* claimSessionDaemonEndpoint(endpoint))._tag).toBe(
      "AlreadyRunning",
    )
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

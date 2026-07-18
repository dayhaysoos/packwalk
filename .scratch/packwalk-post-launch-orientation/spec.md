# PackWalk post-launch session orientation

Status: ready-for-agent

## Problem Statement

Developers can have several ordinary Codex sessions running at once, but Codex
does not provide one trustworthy place to see which projects and sessions are
active, what each session is doing, how current that knowledge is, or where
attention belongs. Reopening terminals and reading transcripts is slow, and a
supervisory product that overstates persisted or polled evidence as live would
be worse than no overview.

PackWalk must start independently after Codex work is already running. It must
help with those sessions without changing how they were launched, owning their
lifecycle, or creating a parallel transcript archive. The first implementation
must prove useful product behavior before trustworthy post-launch live
attachment or consequential control is available.

## Solution

Build the smallest end-to-end PackWalk product slice that independently
discovers an ordinary already-running Codex session from the strongest
supported local persisted evidence, validates and normalizes that evidence,
commits a content-light representation to PackWalk's SQLite database, exposes
the resulting session view through the daemon's public session query/event
surface, and renders it in an isolated OpenTUI client.

The client shows project, exact Codex session identity, supported activity,
evidence source, and freshness. A bounded poller detects later persisted Codex
activity and publishes a committed update through the same daemon seam. The UI
labels the session as discovered or polled; it never calls the session live or
watched until a separately qualified post-launch attachment establishes exact
identity and a trustworthy live observation path.

The implementation remains local, per-user, Codex-only, content-light, and
portable across Windows, macOS, and Linux. A later narrowly bounded experiment
may attempt one real post-launch live event, but it cannot create another
qualification campaign or alter the assistance-only product boundary.

## User Stories

1. As a developer with an ordinary Codex TUI already running, I want to start PackWalk independently, so that supervision does not change how I start Codex.
2. As a developer, I want PackWalk to find an existing Codex session, so that I do not have to copy a session identifier into the product.
3. As a developer, I want to see the session's project and exact identity, so that I know which work the row represents.
4. As a developer with similarly named repositories, I want project identity kept separate from display labels, so that two projects cannot be silently conflated.
5. As a developer, I want to see the strongest supported current activity, so that I can orient without reopening the Codex terminal.
6. As a developer, I want every activity claim to name its evidence source, so that persisted, polled, derived, and future live facts are distinguishable.
7. As a developer, I want freshness shown explicitly, so that delayed polling cannot look current by accident.
8. As a developer, I want the view to update after Codex records additional activity, so that the product demonstrates continuing assistance rather than a static import.
9. As a developer, I want a polling-based session labeled discovered or polled, so that PackWalk does not claim trustworthy live attachment prematurely.
10. As a developer, I want unsupported facts shown as unavailable rather than guessed, so that the overview remains trustworthy.
11. As a developer, I want PackWalk to remain useful when a Codex source temporarily disappears, so that the last committed view becomes visibly stale instead of vanishing or pretending to be current.
12. As a developer, I want multiple overlapping Codex sessions to remain distinct, so that activity from one session never appears under another.
13. As a developer, I want multiple sessions in one repository to remain distinct, so that project identity does not replace session identity.
14. As a developer, I want PackWalk state to survive daemon restart, so that reconnecting a client does not erase the machine-wide overview.
15. As a developer, I want an interactive terminal view that does not own supervision, so that closing the client cannot affect Codex or the daemon's durable state.
16. As a script author, I want the same session view in machine-readable form without initializing OpenTUI, so that automation can use the product safely.
17. As a screen-reader or minimal-terminal user, I want a plain-text equivalent of the interactive view, so that renderer availability is not the only access path.
18. As a privacy-conscious developer, I want PackWalk to retain only structural metadata, so that its database and backups do not become a second transcript archive.
19. As a privacy-conscious developer, I want prompts, responses, command output, diffs, terminal input, and raw Codex payloads excluded from storage and logs, so that observation does not create unnecessary sensitive copies.
20. As a developer, I want one-session deletion and a complete local-data clear, so that PackWalk-controlled state can be removed without deleting or interrupting Codex work.
21. As a developer, I want PackWalk to fail visibly when exact identity cannot be established, so that ambiguous evidence is never attached to an arbitrary session.
22. As a developer, I want PackWalk to avoid creating, resuming, restarting, replacing, relaunching, or interposing on Codex, so that it remains an assistant to work I already started.
23. As a developer, I want the same core behavior on Windows, macOS, and Linux, so that the product is not tied to one operating system's process or socket model.
24. As a maintainer, I want deterministic session sources to exercise the daemon's public surface, so that most behavior can be tested without private Codex data or timing-dependent real sessions.
25. As a maintainer, I want a real-Codex integration test for persisted discovery and polling, so that fixture confidence is anchored to an installed Codex surface.
26. As a maintainer, I want live attachment investigated in one bounded later experiment, so that an uncertain capability does not turn into another pre-implementation qualification program.
27. As a maintainer, I want a failed live experiment to leave the polling product truthful and usable, so that failure cannot revive a wrapper, relay, or PackWalk-owned Codex lifecycle.

## Implementation Decisions

- The product is PackWalk and the canonical executable is `packwalk`.
- PackWalk is assistance-only for this scope. It discovers and inspects ordinary Codex sessions that were already running before PackWalk. It does not create, launch, resume, restart, replace, relaunch, or interpose on a Codex session.
- Codex is the only supported agent. There is no provider registry, provider plugin system, generic provider identity, or speculative cross-agent abstraction.
- A narrow Codex source adapter remains necessary to contain Codex-specific discovery, validation, version, and evidence semantics. Its purpose is replaceable Codex integration, not provider extensibility.
- Persisted discovery does not establish post-launch live attachment. The domain uses distinct tagged states for discovered, polled, and watched sessions. Only a qualified exact live path may produce watched status.
- Every session view carries exact Codex identity, PackWalk commit sequence, evidence source, provenance, observation time, and freshness. Timestamps are metadata rather than causal ordering.
- The Codex source uses the strongest supported local persisted evidence available without changing Codex session lifecycle. If the source is version-specific or not a public compatibility contract, the adapter exposes that limitation and fails toward degraded or unsupported rather than silently widening claims.
- Raw Codex values exist only in a transient adapter zone. Effect Schema validates the accepted source representation and converts it once into closed PackWalk models. Unknown variants fail closed or produce a sanitized unsupported result.
- One pure exhaustive transition function reduces normalized facts into session projections. It contains no effects. Persisted and IPC-crossing states use Effect Schema tagged unions; purely internal decisions may use Effect Data tagged enums.
- Effect v4 is the sole application orchestration and effect runtime. It owns services, Layers, scopes, fibers, cancellation, queues, streams, scheduling, configuration, logging, and test infrastructure. The exact compatible Effect v4 cohort is pinned without floating ranges.
- Before Effect implementation begins, Kit Langton's Effect skill is installed project-locally, its upstream revision is recorded, and the committed project guidance is subordinate to repository rules and the project-pinned Effect source.
- Effect Schema v4 is the sole application runtime validation, decoding, and encoding authority for Codex-normalized facts, database rows, commands, events, IPC, view models, and public errors. No second validation ecosystem is introduced.
- The TypeScript toolchain runs only on Node.js; Bun is prohibited in development, CI, testing, packaging, and production. Dependency initialization selects and exactly pins a Node patch that satisfies the selected OpenTUI and `node:sqlite` versions. Reintroducing OpenTUI means the renderer's qualified Node requirement, rather than the earlier CLI-only floor, controls that exact selection.
- OpenTUI is isolated to an explicit interactive client. OpenTUI types and any required FFI flag do not enter the daemon, Codex adapter, storage, domain core, IPC service, or noninteractive CLI. Closing or crashing the renderer does not affect supervision.
- The initial OpenTUI experience is a lightweight terminal client, not a product requirement for a persistent full-screen dashboard. Plain-text and JSON clients consume the same daemon view model without constructing the renderer.
- The daemon is the sole domain writer and owns the authoritative PackWalk commit sequence. Clients send queries or commands and never write SQLite or reduce Codex facts themselves.
- The daemon starts on demand when a client needs it and persists after clients exit. Initial delivery does not install launchd, systemd, Windows Service, or login-start integration.
- The daemon exposes one public session query/event surface. It returns a current snapshot and committed updates using Effect-Schema-validated contracts. This is the primary external test seam.
- Local IPC uses per-user Unix-domain sockets on macOS and Linux and per-user named pipes on Windows behind one scoped transport service. No TCP listener is opened by default, and no client bypasses the daemon when IPC is unavailable.
- IPC uses bounded framed JSON with explicit protocol versions, typed failures, and backpressure. Mechanical frame limits and queue thresholds are selected during implementation and tested rather than exposed as product decisions.
- SQLite is authoritative for PackWalk durable state. The isolated storage adapter is the only module that imports `node:sqlite` or sees `DatabaseSync`, statements, rows, transaction handles, or driver errors.
- One scoped Effect Layer owns exactly one daemon `DatabaseSync` connection and closes it during finalization. Rows crossing the adapter are decoded with Effect Schema.
- Authoritative writes use portable SQLite, foreign keys, defensive mode, prohibited extensions, explicit integer behavior, WAL, `synchronous=FULL`, and `BEGIN IMMEDIATE`. Connection settings are verified after opening.
- Normalized fact append and current projection update commit in one synchronous bounded transaction. Publication occurs only after successful commit. Provider or IPC work never runs inside the transaction.
- Migrations are repository-owned, immutable, ordered, checksummed, forward-only, and applied transactionally after a SQLite-aware backup. Detailed checkpoint and backup thresholds remain storage-operations decisions.
- Durable observation is metadata-only. PackWalk persists exact identities, project locators, structural lifecycle/activity facts, provenance, freshness, versions, commit ordering, and omission facts. It does not persist prompts, responses, command output, diff content, terminal input, or raw Codex/tool payloads.
- Logs and diagnostics are allowlisted structural metadata only. They never include raw IPC bodies, raw Codex payloads, user text, transcript content, command output, diffs, credentials, or environment snapshots.
- The first implementation contains no consequential Codex action. Existing action-ledger, at-most-once, unknown-outcome, confirmation, and dispatch decisions remain binding constraints for a future action spec but do not expand this read-only slice.
- A narrowly bounded later experiment may attempt to observe one real post-launch live event for the exact already-running session. It may start a connection-only helper when that helper cannot create, resume, restart, replace, or initiate Codex work, but it may not introduce a PackWalk-owned Codex session, wrapper launch, `--remote` prerequisite, relay, qualification harness, or Wayfinder campaign.
- Only a successful, reproducible live experiment may justify a later implementation that promotes a session from discovered/polled to watched. Failure leaves the polling slice intact and truthfully degraded.
- The initial project is one small package with an exact lockfile. npm is the default package manager because it ships with Node and does not add another runtime requirement. A workspace or bundler requires demonstrated need.
- TypeScript is compiled for production and type-checked by the pinned TypeScript compiler. Vitest with the verified compatible Effect test package is the single test runner. OXLint is required; its experimental type-checking mode does not replace TypeScript. No Bun test runner is present.
- Initial development and integration run from the Node package rather than an experimental single-executable mechanism. Detailed installer, signing, notarization, and standalone artifact work is deferred until the product slice is useful.

## Testing Decisions

- Tests assert external behavior at the daemon's public session query/event surface. They do not reach into reducers, repositories, queues, or renderer internals merely because those units exist.
- Deterministic session sources drive the public daemon seam with fixed identities, persisted snapshots, changes, duplicates, malformed rows, missing evidence, and source loss. The same assertions are reused for real Codex where practical.
- The first vertical slice proves that an ordinary Codex TUI starts first, PackWalk starts independently afterward, a real persisted session is discovered, and later Codex activity becomes a visibly polled committed update.
- A real-Codex integration test must demonstrate that discovery neither creates nor resumes a thread, starts a turn, restarts Codex, changes the originating TUI, or requires `--remote`.
- Schema contract tests cover every persisted and IPC-crossing tagged state, unknown variants, version mismatch, redacted errors, and forbidden raw fields.
- Storage tests exercise transaction rollback, constraint enforcement, lock contention, busy-timeout exhaustion, large integers, migration failure, abrupt process termination, and publish-after-commit ordering through repository behavior.
- IPC integration tests use real Unix-domain sockets and Windows named pipes as platform-appropriate, exercising daemon unavailable, reconnect, snapshot-plus-events, bounded framing, slow consumers, and clean shutdown.
- OpenTUI tests consume only PackWalk view models and a fake client port. Renderer startup, update, exit, exception cleanup, terminal restoration, resize, keyboard-only navigation, non-TTY behavior, `TERM=dumb`, and color-disabled output are tested at the client boundary.
- Plain-text and JSON output tests prove they do not import or initialize OpenTUI or require FFI flags.
- Multi-session acceptance uses at least two overlapping Codex sessions and proves exact identity isolation, including two sessions in one repository and duplicate display labels where practical.
- Restart tests prove SQLite authority, monotonic PackWalk commit ordering, snapshot restoration, explicit stale/uncertain states, and no invented replay.
- Privacy tests feed sensitive-shaped synthetic fields and assert that prohibited content cannot cross schemas into storage, logs, diagnostics, IPC views, backups, or deletion remnants.
- Deletion tests prove session deletion, sidecar cleanup, tombstone behavior where applicable, global clear, and no impact on Codex session lifecycle.
- Windows, macOS, and Linux CI run the deterministic daemon/storage/IPC/client seam. Real-Codex integration is separately qualified on available operating-system and architecture artifacts.
- The post-launch live-event experiment has one success criterion: after PackWalk starts, correlate one newly emitted event to the exact ordinary running Codex session without changing its lifecycle or launch topology. A negative result is valid and must remain bounded.

## Out of Scope

- Creating, launching, resuming, restarting, replacing, relaunching, or wrapping Codex sessions.
- Requiring `--remote`, a PackWalk-owned app-server, a PackWalk-owned relay, or any pre-launch PackWalk registration.
- Calling a discovered or polled session live or watched without trustworthy post-launch attachment.
- Consequential actions such as asking, steering, approving, rejecting, interrupting, or starting an idle turn.
- A provider registry, provider plugins, support for non-Codex agents, or generic cross-provider semantics.
- Transcript parsing as an unlabelled trusted source, raw-provider persistence, rich optional content capture, searchable transcript history, or secret-completeness claims.
- Remote clients, public listeners, tunnels, accounts, multi-user authorization, delegated approval, or cryptographic capability protocols.
- A persistent full-screen dashboard, village renderer, editor extension, browser client, mobile client, or public SDK.
- Operating-system notifications, login-start services, detailed installer UX, standalone executable packaging, signing, and notarization.
- Consequential-action implementation, action dispatch qualification, and adoption of Effect Workflow.
- Reviving superseded wrapper or relay qualification work, creating a new qualification harness, or reopening the resolved post-launch product boundary.

## Further Notes

- [ADR 0001](../../docs/adr/0001-require-post-launch-attachment.md) is authoritative for the product boundary. Superseded wrapper and relay artifacts are historical evidence only; they are not implementation requirements, release gates, or blockers.
- Exact dependency versions are selected during initialization, pinned in the manifest and lockfile, and upgraded only through deliberate qualification.
- The daemon public session query/event surface is approved as the primary seam unless implementation reveals an actual repository contradiction. No such contradiction exists in the current corrected repository.
- The first ticket must remain visibly demoable even though the repository currently has no production TypeScript. It therefore establishes only the minimum end-to-end skeleton needed for one real polled session and leaves breadth, hardening, and release engineering to later tracer bullets.

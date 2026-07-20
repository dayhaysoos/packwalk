# Keep overlapping Codex sessions distinct

Status: claimed
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A multi-session overview that never mixes identity or activity when Codex
sessions overlap, share a repository, or have duplicate display labels.

## Acceptance criteria

- [x] At least two concurrently discoverable sessions appear as distinct rows
      through the daemon surface and CLI view.
- [x] Two sessions in one repository remain distinct by exact Codex identity;
      project paths and human labels are not used as session identity.
- [x] A polling change for one session cannot alter another session's activity,
      evidence, freshness, or commit identity.
- [x] Ambiguous or duplicate source evidence fails visibly instead of being
      attached to an arbitrary session.
- [x] Identity and path comparisons have explicit Windows, macOS, and Linux
      behavior, including platform case and separator differences.

## Comments

- 2026-07-20: Claimed on `agent/ticket-04-overlapping-sessions` from fixed
  integration point `31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8`. Acceptance
  will be proved through the daemon's public session stream and CLI view with a
  deterministic overlapping-session source, exact-identity storage/projection
  isolation, a visible ambiguous-evidence failure, and injected-platform path
  comparison contracts for Windows, macOS, and Linux. Ticket 04 does not add
  restoration, history, deletion, live attachment, intervention, or routing.
- 2026-07-20: Implementation is complete on the ticket branch and every
  agent-verifiable criterion is covered. A two-row same-repository Codex SQLite
  fixture crosses the real daemon and local IPC seam into the CLI formatter;
  an exact-ID update changes only its own persisted projection and global
  commit identity. Duplicate exact IDs produce only the redacted protocol-v2
  `source-ambiguous` result. Injected platform contracts preserve exact session
  identity while applying Windows case/separator normalization and
  case-sensitive macOS/Linux path behavior. The v1 singleton database migrates
  transactionally after a SQLite backup into exact-ID rows with a preserved
  global allocator. `npm run verify` passes 21 files and 83 tests plus
  typecheck, lint, and build. Fresh generic review and product preflight remain
  before resolution; no maintainer acceptance is claimed.
- 2026-07-20: The strongest real-product check found an upgrade blocker after
  deterministic verification passed: the machine's still-running protocol-v1
  daemon accepted its old endpoint and then rejected the protocol-v2 overview
  subscription. Falling back would silently return only the old singleton, and
  killing an unversioned persistent daemon is not a safe client action. Ticket
  04 remains claimed while the incompatible v2 IPC endpoint is isolated and
  the compiled product path is rerun. The existing daemon and Codex processes
  were left untouched.
- 2026-07-20: The upgrade blocker is fixed. Incompatible local session
  protocols now use distinct per-user endpoints (`daemon-v2.sock` on Unix and
  a `packwalk-v2-*` named pipe on Windows), so a new client cannot mistake a
  persistent v1 daemon for its v2 overview service or silently fall back to a
  singleton. A compiled macOS arm64 exercise kept a legacy endpoint accepting
  connections while the v2 daemon and both one-shot clients used only the new
  endpoint. Two same-project exact IDs remained distinct; after one source row
  advanced, its timestamp and commit advanced while the other serialized view
  remained identical. Text contained both exact IDs, JSON was a protocol-v2
  `SessionsSnapshot`, every command exited zero with empty stderr, and the
  legacy endpoint received zero connections. The isolated processes and data
  were removed afterward. Vitest's file fan-out is bounded at four workers
  after the expanded suite repeatedly exposed `EPERM` in the existing detached
  process-tree cleanup at the default machine-wide fan-out; two consecutive
  complete test runs and `npm run verify` are green. Only fresh review gates
  remain.
- 2026-07-20: Generic review pass 1 found two actionable version-boundary
  defects. The v2 endpoint still accepted a v1 subscription and the v2 client
  still decoded a v1 singleton event, permitting a false cross-version result.
  Separately, v1 and v2 endpoints could leave two daemons writing the same
  `packwalk.sqlite`, violating the single-writer boundary when v2 migrated the
  table out from under v1. Ticket 04 remains claimed while both defects receive
  deterministic regressions and fixes; fresh full verification and a wholly
  new generic review pass are required afterward.
- 2026-07-20: Review pass 1's blockers and the follow-up storage audit are
  repaired. The production command, server, client, and surface schemas are
  protocol-v2-only and reject cross-version frames in both directions. V2 now
  owns `packwalk-v2.sqlite`; it snapshots a still-active legacy WAL database
  only after claiming an endpoint derived from the normalized durable database
  path, so launch-time runtime-directory differences cannot split writer
  authority. Import keeps the legacy database writable, retains a checked
  pre-migration snapshot, migrates a rollback-journal staging database, and
  atomically promotes it. Backup completion is uninterruptible, handled
  failures clean their staging files, and an existing retained backup resumes
  a crash-interrupted startup rather than wedging it. Focused verification
  passes 37 tests and `npm run verify` passes 21 files and 92 tests plus
  typecheck, lint, and build. The opt-in persisted-Codex polling check passed in
  8.23 seconds. The compiled product then upgraded beside the machine's
  untouched protocol-v1 daemon: text and JSON exited zero with empty stderr,
  all 19 exact identities appeared, and a later persisted update advanced only
  this task's exact row while the other 18 serialized hashes stayed unchanged.
  The test-started v2 daemon was stopped by its verified endpoint-owning PID;
  the pre-existing v1 daemon remained running. Ticket 04 stays claimed only
  for a wholly fresh generic review and independent product preflight; no
  maintainer acceptance is claimed.

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
- 2026-07-20: Fresh generic review pass 2 reports zero actionable
  Specification findings and three actionable Standards findings. Polling can
  sort two swapped exact-ID responses back into apparently valid order; Unix
  and Windows endpoint tokens use lexical rather than physical database
  identity; and the predictable Unix `/tmp` directory is accepted and
  `chmod`ed without first rejecting a symlink or foreign owner. Ticket 04
  remains claimed while red regressions bind each poll request to its response,
  canonicalize durable authority aliases, and prove secure endpoint-directory
  creation. Full verification and an entirely fresh generic review follow;
  product preflight has not started.
- 2026-07-20: All three pass-2 Standards defects are repaired with red-first
  regressions. Every poll response is now bound to the exact identity that was
  requested; crossed responses publish the redacted protocol-v2
  `source-incompatible` result and leave the stored snapshot unchanged.
  Production endpoint authority resolves a database or its nearest existing
  ancestor to physical durable identity, so launch-time path aliases converge.
  Unix endpoint setup opens the leaf with `O_NOFOLLOW | O_DIRECTORY`, verifies
  the real directory and current owner, and changes permissions through the
  verified descriptor; the PackWalk data directory remains private as well.
  Focused verification passes 25 tests, `npm run verify` passes 21 files and 96
  tests plus typecheck, lint, and build, and the opt-in persisted-Codex check
  passes in 8.22 seconds. The compiled product again returned all 19 unique
  exact identities through text and protocol-v2 JSON with zero exits and empty
  stderr. Ticket 04 remains claimed for a wholly fresh generic review and
  independent product preflight; no maintainer acceptance is claimed.
- 2026-07-20: Fresh generic review pass 3 reports zero actionable
  Specification findings and one P1 Standards blocker. The domain accepts an
  unbounded protocol-v2 overview, while IPC rejects its complete encoding over
  4 MiB; the surface currently commits that state before publication. A
  strictly decoded 90-row maximum-size snapshot measured 4,444,968 bytes
  against the 4,194,304-byte frame limit, so legitimate persisted evidence can
  become durably unpublishable. Ticket 04 remains claimed while a red
  overview-level regression and an Effect-based pre-commit validation seam
  prove that every accepted v2 event is transportable. Full verification and
  an entirely fresh generic review follow; product preflight remains paused.
- 2026-07-20: The pass-3 P1 blocker is repaired with red-first startup,
  update, and protocol regressions. One exported Effect JSON codec now enforces
  the exact 4 MiB UTF-8 limit on both encode and decode, and local IPC uses that
  codec without a second outgoing-size policy. The surface validates each
  complete snapshot or update before storage commit. An unpublishable overview
  emits the small redacted protocol-v2 `overview-unavailable` result, preserves
  the last durable rows and commit sequence, and recovers through a bounded
  snapshot when source evidence becomes publishable. Focused verification
  passes 26 tests; `npm run verify` passes 21 files and 99 tests plus typecheck,
  lint, and build; and the opt-in persisted-Codex check passes in 8.18 seconds.
  A supplemental Effect/IPC audit reports zero actionable findings. Ticket 04
  remains claimed for a wholly fresh generic review and independent product
  preflight; no maintainer acceptance is claimed.
- 2026-07-20: Fresh generic review pass 4 reports zero actionable
  Specification findings and one P1 Standards blocker. An 84-row maximum-field
  snapshot is publishable at 4,147,464 bytes, but the required first poll turns
  every row from `Discovered` to `Polled`; repeating all 84 identities in
  `SessionsUpdated` raises that event to 6,209,601 bytes. The current rejection
  preserves storage but can repeat forever without unrelated source mutation.
  Ticket 04 remains claimed while a red boundary regression proves that a
  publishable complete snapshot becomes the committed fallback when only its
  richer update envelope exceeds the shared codec limit. Full verification and
  an entirely fresh generic review follow; product preflight remains paused.
- 2026-07-20: The pass-4 P1 blocker is repaired with a red boundary
  regression. For normal changes, the surface validates `SessionsUpdated`
  first and falls back to the equivalent complete `SessionsSnapshot` when only
  the changed-identity envelope exceeds the shared codec limit. If neither is
  publishable it still emits `overview-unavailable` without committing, while
  recovery from an unavailable state remains snapshot-based. The 84-row proof
  commits every row exactly once as `Polled` at sequences 85–168, leaves
  sequence 168 unchanged on the next poll, and reconnects to the committed
  polled snapshot. Focused verification passes 13 tests; `npm run verify`
  passes 21 files and 100 tests plus typecheck, lint, and build; and the opt-in
  persisted-Codex check passes in 8.20 seconds. A supplemental fallback audit
  reports zero actionable findings. Ticket 04 remains claimed for a wholly
  fresh generic review and independent product preflight; no maintainer
  acceptance is claimed.
- 2026-07-20: Fresh generic review pass 5 reports one P1 Standards blocker
  and one P2 public-contract documentation gap. On this macOS host, the
  `/Users/.../packwalk-v2.sqlite` and
  `/System/Volumes/Data/Users/.../packwalk-v2.sqlite` spellings resolve to the
  same device/inode but still derive different IPC endpoints, so firmlink or
  bind-mount aliases can split sole-writer daemon authority. Separately, the
  README and opening current-state contract imply every committed poll is
  `SessionsUpdated`, omitting the intentional bounded `SessionsSnapshot`
  fallback. Ticket 04 remains claimed while native filesystem authority gets a
  red alias regression and stable identity anchor, and both public contracts
  document the two valid committed-poll variants. Full verification and an
  entirely fresh generic review follow; product preflight remains paused.
- 2026-07-20: Pass 5's P2 contract gap is repaired in the README and opening
  current-state handoff. Both now state that committed polling normally emits a
  complete `SessionsUpdated` with exact `changedSessionIds`, while an oversized
  update envelope may use the equivalent bounded complete `SessionsSnapshot`;
  consumers treat both as current overviews. The native filesystem-authority
  P1 remains the active blocker. No review gate has been waived.
- 2026-07-20: The native alias implementation now makes both real macOS
  spellings converge and passes 107 deterministic tests plus the persisted
  source check, but its final targeted audit found two P1s before checkpoint.
  Revalidation currently calls the preparing resolver, so a missing/swapped
  data directory is recreated and chmodded before comparison instead of
  failing read-only. Also, a final database symlink may anchor an external
  shared target parent without verifying current ownership and private mode,
  allowing target-file replacement to evade the parent-identity checks. Ticket
  04 remains claimed while red regressions split prepare from capture and
  reject non-private symlink target parents. Fresh full verification and a
  wholly new generic review remain required; product preflight stays paused.
- 2026-07-20: Both targeted authority P1s are repaired with red-first
  regressions. Initial resolution creates and secures the exact PackWalk data
  directory, then derives one v2 endpoint from its raw BigInt device/file
  identity plus the normalized database basename. Revalidation uses a separate
  capture-only path and leaves a missing directory absent on failure. Existing
  final database symlinks require a current-user-owned mode-0700 target parent;
  shared and dangling targets fail without chmod, and Windows final-file
  symlinks fail closed pending native qualification. CLI verifies after prep;
  the daemon verifies before claim, immediately after claim before either the
  `AlreadyRunning` return or migration, and after session/storage acquisition.
  The two real macOS spellings now derive the same
  `/tmp/packwalk-v2-35ce8d997aaefb5435f8bb4f/daemon-v2.sock`. Focused checks
  pass 25 tests; `npm run verify` passes 21 files and 108 tests plus typecheck,
  lint, and build; and the persisted-Codex check passes in 4.12 seconds. The
  compiled JSON/text path returns all 19 unique exact identities with zero
  exits and empty stderr. Its endpoint-owning v2 PID 27668 was stopped; the
  pre-existing v1 PID 77857 remains untouched. Final targeted authority review
  reports zero actionable findings. Ticket 04 remains claimed for a wholly
  fresh generic review and independent product preflight; no maintainer
  acceptance is claimed.
- 2026-07-20: Fresh generic review pass 6 reports zero actionable
  Specification findings and one P1 Standards blocker in the real launcher
  order. If the captured PackWalk data directory is replaced with a symlink,
  `prepareRuntimeDirectories` follows it and chmods the unrelated owned target
  before `verifyRuntimeAuthority` rejects the changed identity. Ticket 04
  remains claimed while a red regression covers the exact prepare-then-verify
  sequence and preparation stops mutating the already-secured database
  authority. Full verification and an entirely fresh generic review follow;
  product preflight remains paused.
- 2026-07-20: Pass 6's preparation-time P1 is repaired with the exact red
  launcher-sequence regression. Runtime-path resolution alone creates,
  secures, and captures the PackWalk database directory; later preparation no
  longer creates or chmods that authority and owns only the independent Unix
  endpoint directory. A swapped data-directory symlink now remains a symlink,
  its unrelated mode-0755 target remains unchanged, and the capture-only
  verification rejects the launch. Focused runtime/build verification passes
  24 tests. Full verification and an entirely fresh generic review remain
  pending; product preflight stays paused.
- 2026-07-20: Full post-repair verification is green: `npm run verify` passes
  21 files and 109 tests plus typecheck, lint, and build; the opt-in persisted
  Codex check passes in 4.13 seconds. The rebuilt public JSON and text clients
  each exit zero with empty stderr, return all 19 unique exact identities, and
  JSON is a protocol-v2 `SessionsSnapshot`. The positively identified
  endpoint-owning v2 PID 32103 was stopped after the exercise; pre-existing v1
  PID 77857 remains running and untouched. Ticket 04 remains claimed for a
  wholly fresh generic review; product preflight remains paused.
- 2026-07-20: Fresh generic review pass 7 reports zero actionable
  Specification findings and one P1 Standards blocker. Two private database
  directories can hard-link one existing `packwalk-v2.sqlite` inode yet derive
  different daemon endpoints; separate writers could then open the same main
  file through different pathnames with different adjacent WAL/SHM files.
  Ticket 04 remains claimed while a native-filesystem regression proves the
  split and both initial resolution and capture-only revalidation reject any
  existing database target whose link count is not exactly one. Full
  verification and an entirely fresh generic review follow; product preflight
  remains paused.
- 2026-07-20: Pass 7's hard-link P1 is repaired with a native-filesystem
  regression that first proved two endpoint authorities around one inode.
  Every existing database entry must now be a regular file with native link
  count exactly one, whether addressed directly or through a qualified final
  symlink; capture-only revalidation enforces the same rule. Missing databases
  still anchor to their private parent directory, and atomic replacement keeps
  endpoint authority stable. Focused runtime/build verification passes 25
  tests. Full verification and an entirely fresh generic review remain
  pending; product preflight stays paused.
- 2026-07-20: Full post-hard-link verification is green: `npm run verify`
  passes 21 files and 110 tests plus typecheck, lint, and build; the opt-in
  persisted-Codex check passes in 4.13 seconds. Rebuilt JSON and text clients
  each exit zero with empty stderr and contain all 19 unique exact identities;
  JSON is a protocol-v2 `SessionsSnapshot`. The positively identified v2
  endpoint owner PID 98474 was stopped, and pre-existing v1 PID 77857 remains
  running and untouched. Ticket 04 remains claimed for a wholly fresh generic
  review; product preflight remains paused.
- 2026-07-20: Fresh generic review pass 8 reports zero actionable
  Specification findings and one P1 Standards blocker in daemon election. A
  live Unix endpoint directory under `/tmp` can be renamed, recreated at the
  original pathname, and bound again while the first server remains active;
  both claims return `Owned` for one durable database authority. Ticket 04
  remains claimed while a red real-socket regression separates daemon-lifetime
  writer authority from the replaceable transport namespace. The durable
  authority lock must be acquired before storage and retained for the daemon
  scope; the transport bind remains a delivery check, not the sole-writer
  primitive. Full verification and fresh generic review follow; product
  preflight remains paused.
- 2026-07-20: Pass 8's split-election P1 is repaired with the red real-socket
  regression. Runtime paths now derive a second endpoint from the raw durable
  database authority: a hidden socket in the qualified database directory on
  Unix and a distinct authority-keyed named pipe on Windows. The daemon claims
  and drains that listener before transport election or storage acquisition
  and retains it through the Effect scope. Renaming and recreating `/tmp` still
  proves that a second transport socket can bind, but the composed daemon claim
  returns `AlreadyRunning` while the first authority listener is alive.
  Focused runtime, ownership, build, and type checks pass 28 tests. Full
  verification and a wholly fresh generic review remain pending; product
  preflight stays paused.
- 2026-07-20: The strongest compiled public-path check found a blocker before
  checkpoint: the first Unix writer-lock name is 105 bytes in the real macOS
  PackWalk data directory, beyond the native socket-path limit. JSON and text
  both fail safely with one redacted error, and neither authority nor transport
  socket is left behind. Ticket 04 remains claimed while a deterministic
  ordinary-macOS path regression shortens the hidden identity-keyed basename
  within the portable bound and an explicit overlong-path contract fails
  before bind. Full verification, public-path rerun, and fresh review remain
  required; product preflight stays paused.
- 2026-07-20: The macOS socket-length blocker is repaired red-first. The
  identity token is unchanged, but the hidden Unix lock basename is now the
  compact `.pw-v2-<24 hex>`; the real PackWalk path is 87 bytes against the
  conservative 103-byte portable bound. Runtime derivation rejects any
  overlong authority path before socket bind with the existing redacted startup
  failure. Both ordinary-path and overlong-path regressions pass. Full
  verification, compiled public-path rerun, targeted lock audit, and wholly
  fresh generic review remain pending; product preflight stays paused.
- 2026-07-20: The targeted writer-lock audit found the first shortening still
  regressed the required real macOS firmlink seam: the same data directory via
  `/System/Volumes/Data/Users/...` reached about 107 bytes and failed runtime
  derivation even though `/Users/...` fit. The existing real-alias test is red.
  The lock keeps the same full 96 authority bits but now encodes them as 16
  base64url characters rather than 24 hexadecimal characters, bringing both
  native spellings within the conservative bound. The audit remains open until
  both real aliases and composed ownership pass; no review gate is waived.
- 2026-07-20: The final writer basename is `.pw-<16 base64url>`, preserving all
  96 authority bits while bringing the installed `/Users/...` and
  `/System/Volumes/Data/Users/...` paths to 76 and 96 bytes. A short native
  firmlink fixture keeps its two lock spellings lexically distinct, binds and
  drains the physical listener, and proves the alias claim is
  `AlreadyRunning`; the explicit overlong-path failure remains. Focused
  runtime, ownership, build, type, lint, and diff checks pass 30 tests. The
  final targeted lock audit reports zero actionable findings. Full
  verification, compiled public-path rerun, and wholly fresh generic review
  remain pending; product preflight stays paused.
- 2026-07-20: Full post-lock verification is green: `npm run verify` passes 21
  files and 113 tests plus typecheck, lint, and build; the persisted-Codex check
  passes in 4.11 seconds. Rebuilt JSON and text clients each exit zero with
  empty stderr and contain all 19 exact identities; JSON is a protocol-v2
  `SessionsSnapshot`. Positively identified PID 35013 owned both the durable
  `.pw-Nc6NmXqu-1Q1-LtP` writer socket and the v2 `/tmp` transport, then was
  stopped and released both; pre-existing v1 PID 77857 remains running and
  untouched. Ticket 04 remains claimed for a wholly fresh generic review;
  product preflight remains paused.

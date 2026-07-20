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
- 2026-07-20: Fresh generic review pass 9 reports zero actionable
  Specification findings and one P1 Standards blocker at the v1/v2 storage
  boundary. A qualified final symlink from `packwalk-v2.sqlite` to
  `packwalk.sqlite` exists, so import preparation returns early and v2 storage
  migrates the legacy database in place while its older writer may remain
  active. Ticket 04 remains claimed while a red regression holds the legacy
  writer open and the storage adapter rejects physically identical legacy and
  versioned paths before the early return or any database open. Full
  verification and wholly fresh generic review follow; product preflight
  remains paused.
- 2026-07-20: Pass 9's v1/v2 alias P1 is repaired red-first at the storage
  boundary. Before the existence early return or any SQLite open, import
  preparation follows both existing paths and rejects matching native
  device/inode identity as the redacted storage-open error. The regression
  keeps the legacy connection open, proves startup fails, and confirms its only
  table remains `current_session`; the complete storage file passes 13 tests.
  Full verification and a wholly fresh generic review remain pending; product
  preflight stays paused.
- 2026-07-20: Full post-alias verification is green: `npm run verify` passes
  21 files and 114 tests plus typecheck, lint, and build; the persisted-Codex
  check passes in 4.12 seconds. Rebuilt JSON and text each exit zero with empty
  stderr and contain all 19 exact identities; JSON is a protocol-v2
  `SessionsSnapshot`. Positively identified PID 90906 owned both v2 writer and
  transport sockets and was stopped cleanly; pre-existing v1 PID 77857 remains
  running and untouched. Ticket 04 remains claimed for a wholly fresh generic
  review; product preflight stays paused.
- 2026-07-20: Fresh generic review pass 10 reports zero actionable
  Specification findings and one P1 Standards blocker in writer ownership. A
  live filesystem socket can be unlinked without closing its listener; after
  both authority and transport entries are removed, a second composed claim
  returns `Owned` while the first remains active. Ticket 04 remains claimed
  while that exact red regression replaces pathname authority with a dedicated
  SQLite lock file whose scoped connection holds an exclusive transaction for
  the daemon lifetime. Sockets return to transport/liveness only. Full
  verification and wholly fresh generic review follow; product preflight
  remains paused.
- 2026-07-20: Pass 10's replaceable-path authority P1 is repaired red-first.
  Runtime paths now derive a dedicated identity-keyed SQLite lock file beside
  the qualified v2 database on every supported platform. Before transport or
  storage, the daemon retains a scoped `BEGIN EXCLUSIVE` connection; a busy
  lock exits as `AlreadyRunning`, while ordinary Unix socket removal or
  directory replacement can only create another transport listener. Direct
  regressions prove one owner under contention, release on scope close,
  physical macOS firmlink convergence, and fail-closed symlink and hard-link
  entries. Typecheck and 33 focused authority, endpoint, and runtime-path tests
  pass. Full verification and wholly fresh generic review remain pending;
  product preflight stays paused.
- 2026-07-20: A targeted follow-up audit rejects that first SQLite-lock repair
  before checkpoint. On Unix, unlinking the lock database preserves the first
  connection's inode lock but lets a second claim create a new file at the same
  pathname and also return `Owned`. The separate `node:sqlite` authority module
  also contradicts ADR 0007's accepted single storage adapter and connection
  owner. Ticket 04 remains claimed while the exact pathname-removal case drives
  a retained kernel authority with no filesystem election pathname and no
  second SQLite connection. The earlier 33-test result is not an acceptance
  verdict. Full verification and fresh review remain required; product
  preflight stays paused.
- 2026-07-20: The follow-up authority blocker is repaired at the domain-store
  seam without reopening the specification's no-TCP rule. The one scoped
  authoritative `DatabaseSync` now enters verified exclusive locking mode and
  forces acquisition before first-start import, transport, workers, or
  publication. Legacy state is snapshotted and transactionally copied into
  that already-open current database; the unsafe staged-main rename path is
  removed. Exact regressions prove one winner during two concurrent missing-v2
  starts, continued commits after a loser fails, clean ownership transfer after
  scope close, native macOS alias convergence, and storage refusal after the
  Unix transport directory or live socket is replaced. Typecheck and 44
  focused storage, transport, and runtime-path tests pass. Deliberate same-user
  deletion or replacement of PackWalk's authoritative database file is not
  claimed as a security boundary. Full verification and wholly fresh generic
  review remain pending; product preflight stays paused.
- 2026-07-20: Post-repair qualification is green. `npm run verify` passes 22
  files and 117 tests plus typecheck, lint, and build; a static architecture
  law keeps `node:sqlite` inside the approved source adapter, and the opt-in
  persisted-Codex check passes in 8.23 seconds. An isolated compiled daemon was
  the sole open owner of its v2 database. Independent ordinary and
  transport-unlinked contenders both exited 1 with no output while that owner
  stayed alive; after its deliberate `SIGKILL`, a successor acquired the same
  endpoint and reopened the durable snapshot containing both exact
  same-project sessions. The installed JSON and text clients then returned 19
  distinct exact identities, including two in one project, with zero command
  errors. Positively identified v2 PID 2155
  owned the production v2 database and endpoint and was stopped; pre-existing
  v1 PID 77857 remains alive and untouched. Ticket 04 remains claimed only for
  a wholly fresh generic review and independent product preflight; no
  maintainer acceptance is claimed.
- 2026-07-20: Fresh generic review pass 11 reports zero actionable
  Specification findings and two independently confirmed Standards blockers.
  Runtime resolution still accepts network-backed application-data paths even
  though exclusive WAL authority is local-filesystem-only. After storage
  authority succeeds, an unrelated accepting listener can also be
  misclassified as `AlreadyRunning`, even though a healthy current daemon
  would have prevented that storage acquisition. The authoritative current
  handoff additionally needs its superseded staged-promotion chronology marked
  historical and its durable restart wording distinguished from Ticket 05's
  broader restoration/degradation behavior. Ticket 04 remains claimed while
  red regressions and documentation repairs address every finding; full
  verification and an entirely fresh generic review follow. Product preflight
  remains paused.
- 2026-07-20: Pass 11's blockers are repaired red-first. Runtime authority now
  qualifies the physical storage directory before SQLite opens and again
  before transport: APFS on macOS, an explicit local-filesystem allowlist on
  Linux, and ordinary absolute drive spelling on Windows. Remote, unknown,
  zero, and failed POSIX probes plus direct Windows UNC and device spellings
  fail closed. The pinned Node runtime cannot distinguish mapped Windows drives,
  so those remain unqualified and outside the release claim until Ticket 10
  adds native qualification or keeps them unsupported. After storage election,
  a foreign accepting listener now produces a redacted transport-unavailable
  failure rather than false `AlreadyRunning`. The authoritative current-state
  contract is separated from superseded staged-promotion chronology and
  ordinary durable restart no longer claims Ticket 05's broader recovery
  semantics. `npm run verify` passes 22 files and 140 tests plus typecheck,
  lint, and build; the persisted-Codex check passes in 8.22 seconds. Ticket 04
  remains claimed for an entirely fresh generic review and independent product
  preflight; pre-existing v1 PID 77857 remains alive and untouched.
- 2026-07-20: An independent follow-up locality audit found two remaining P1s
  before the fresh review could start. A drive-letter spelling can still hide
  a mapped Windows share, so release code must fail Windows storage closed
  until Ticket 10 adds positive native volume qualification. Linux eCryptfs and
  overlayfs can hide network-backed lower layers and must be removed from the
  qualified-local allowlist. `$tdd` policy laws now fail on both exact cases;
  verification, generic review, and product preflight remain paused until the
  green implementation and matching handoff repair.
- 2026-07-20: Both follow-up P1s are implemented green. Windows native storage
  now fails before directory or SQLite creation until Ticket 10 adds positive
  native volume qualification; deterministic Windows path, identity, and
  named-pipe contracts remain covered. eCryptfs and overlayfs are removed from
  the qualified direct-local Linux set because their lower storage cannot be
  proven by top-layer `statfs`. The 53 focused locality and endpoint tests pass;
  `npm run verify` passes 22 files and 141 tests plus typecheck, lint, and build;
  and the real persisted-Codex check passes in 8.21 seconds. On the fresh
  compiled build, ordinary and transport-unlinked contenders both exited 1
  while the sole database owner remained alive; after deliberate `SIGKILL`, a
  successor reopened both exact fixture sessions with zero combined output
  bytes. Installed text and JSON returned 19 unique exact identities, including
  two in one project. Positively identified v2 database/endpoint owner PID
  23156 was stopped; v1 PID 77857 remains alive and untouched. Ticket 04 is
  claimed only for an entirely fresh generic review and independent product
  preflight.
- 2026-07-20: Fresh generic review pass 12 reports zero actionable
  Specification findings and two P1 Standards/storage blockers. An existing
  database object can be a single-file bind mount on unqualified storage even
  when its parent qualifies, so object and parent must both qualify and share
  the same native storage device. The intentional Windows fail-closed policy
  also leaves
  native success-path tests guaranteed to fail on Windows and host-coupled on
  unqualified Linux temporary filesystems. Red regressions now cover both
  direct and final-symlink database-object qualification. Native product tests
  must separate injected path/identity laws, qualified-host success, and
  visible unqualified-host failure with no database or endpoint publication.
  Ticket 04 remains claimed; verification, fresh generic review, and product
  preflight are paused until both blockers are repaired.
- 2026-07-20: Both pass 12 blockers are implemented. Existing direct database
  files and resolved final-symlink targets receive their own filesystem
  qualification and must share a positive native storage device with the
  qualified physical parent; revalidation applies the same law after a missing
  database is created. Native product tests now select qualified-host text/JSON
  success or unqualified-host redacted failure before database or endpoint
  publication. Pure injected path, identity, and endpoint laws remain
  cross-platform, and the opt-in real-Codex test skips hosts where product
  storage cannot qualify. Focused tests, full verification, and an entirely
  fresh generic review remain pending; product preflight stays paused.
- 2026-07-20: Post-repair qualification is green. The focused runtime/product
  suite passes 55 tests with the opposite host-policy branch intentionally
  skipped. `npm run verify` passes 22 files, 147 tests, and one intentional
  host-policy branch skip plus typecheck, lint, and build; the real
  persisted-Codex check passes in 8.24 seconds. On the fresh compiled build,
  ordinary and transport-unlinked contenders both exited 1, the sole database
  owner stayed alive, and a successor after deliberate `SIGKILL` reopened both
  exact fixture sessions with zero combined output bytes. Installed text and
  JSON returned 19 unique exact identities, including two in one project.
  Positively identified v2 database/endpoint owner PID 70385 was stopped; v1
  PID 77857 remains alive and untouched. Ticket 04 is claimed only for an
  entirely fresh generic review and independent product preflight.
- 2026-07-20: Fresh generic review pass 13 is clean across the complete branch
  from fixed integration point `31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8`
  through `6acb970db0cd42e118c8cec924ea85fa817dba28`. Independent Standards and
  Specification reviewers report zero actionable findings, and a separate
  storage/platform audit reports zero blockers across filesystem
  qualification, same-device revalidation, Windows fail-closed behavior,
  host-selected native tests, retained writer election, transport truth, and
  crash-successor reopening. Ticket 04 remains claimed only while the
  independent product preflight runs; no maintainer acceptance is claimed.

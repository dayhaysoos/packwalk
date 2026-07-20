# Restore and degrade the overview safely

Status: resolved
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A durable overview that restores after daemon restart and becomes explicitly
stale, uncertain, or unsupported when its Codex evidence can no longer be
observed.

## Acceptance criteria

- [x] Restarting the PackWalk daemon restores the last committed session view
      from SQLite without recreating, resuming, or changing Codex.
- [x] PackWalk commit ordering remains monotonic and restored state is not
      presented as a newly observed Codex event.
- [x] Temporary source loss retains the last supported metadata with explicit
      stale/uncertain provenance and freshness; unsupported evidence is never
      guessed or silently dropped.
- [x] Reappearance produces a new committed observation through the daemon
      surface without invented replay.
- [x] Restart, local application-data paths, source loss, and reconnect behavior
      use platform services and have deterministic coverage for Windows,
      macOS, and Linux semantics.

## Comments

- 2026-07-20: Claimed on `agent/ticket-05-safe-restoration` from fixed
  integration point `ef6ed5074b6a039ae7ced76e50508405c82f338e`. Acceptance
  will be proved through public daemon/IPC/CLI lifecycle tests: a second daemon
  scope restores commit N without changing its observation metadata; the next
  genuine observation becomes N+1; source loss commits retained metadata with
  explicit stale/uncertain provenance; the same persisted fact reappearing
  becomes exactly one fresh committed observation without replay; and injected
  Windows, macOS, and Linux path/reconnect laws remain explicit. Ticket 05 does
  not add evidence history, deletion, generic migration/backup recovery,
  contention handling, native platform qualification, live attachment,
  intervention, or routing.
- 2026-07-20: Implementation is green pending review gates. `SessionView` v2
  adds closed `Observed` and `Retained` provenance with explicit fresh/stale
  consistency; strict protocol-v3 commands and events use a distinct v3 local
  endpoint. Exact unavailable, incompatible, ambiguous, crossed, and regressed
  polling evidence retains prior metadata without merging rejected payloads.
  A failed overview discovery with known rows retains those rows as
  `source-unsupported` instead of hiding the failure behind successful exact
  polls; repeated degradation is a no-op and the same valid source fact
  recovers once.
  Storage migration 3 preserves the immutable migration-2 checksum, validates
  rows and allocator before upgrading an existing v2 overview in place, and
  takes an SQLite-aware `.pre-migration-v3.sqlite` backup. A real
  daemon/SQLite/IPC/CLI test closes one daemon scope, restores commit N
  byte-for-byte in a second, commits exact loss as N+1 and same-fact recovery
  as N+2, renders every frame through the production CLI client, and reconnects
  to one current snapshot without replay. A separate two-session test proves
  only the lost identity changes. The deterministic suite passes 22 files, 157
  tests, and one intentional host-policy skip; typecheck, lint, build, and diff
  checks pass.
  The opt-in installed-Codex test also passes against this machine's real
  persisted source without starting, resuming, or changing a Codex session.
  Fresh generic review and independent product preflight remain required. A
  persistent protocol-v2 daemon must release the shared `packwalk-v2.sqlite`
  writer before protocol v3 can migrate it; PackWalk fails closed and does not
  kill that older daemon. Generic upgrade recovery belongs to Ticket 08.
- 2026-07-20: The first fresh generic review reported three Standards findings
  and two Specification findings. All five are fixed: storage-v3's checksum is
  pinned, frozen migration names are versioned, reducer bookkeeping is shared,
  unsupported discovery is visibly retained, and the lifecycle proof crosses
  the CLI renderer. Full verification and the installed-Codex test are green;
  a wholly fresh generic review remains required.
- 2026-07-20: The second fresh generic review reported three Standards smells
  and one Specification blocker. All four are fixed. Discovery reduction is
  now discovery-only, polling no longer advertises an unreachable transition
  failure, fixture controls are shared, and regressed exact evidence found
  during daemon startup is committed and rendered as retained
  `source-unsupported` metadata across reconnect. Recovery of the last
  supported fact commits once and repeated reconnect is a no-op. Full
  verification passes 155 tests plus one intentional skip, and the
  installed-Codex test remains green; another wholly fresh review is required.
- 2026-07-20: The third fresh generic review reported one Standards smell and
  one Specification blocker. Both are fixed. Startup and runtime observations
  now share one encode-before-commit, commit-before-publication finalizer. A
  successful exhaustive discovery that omits a restored exact identity commits
  that row once as retained `source-unavailable` metadata instead of leaving it
  fresh. A restart/IPC/one-shot text test proves the missing and present rows
  remain visible with different provenance, and repeated reconnect is a no-op.
  Full verification passes 156 tests plus one intentional skip, and the
  installed-Codex test remains green; another wholly fresh review is required.
- 2026-07-20: The fourth fresh review returned zero actionable Specification
  findings and one Standards smell. The duplicated v3 `current_sessions` DDL
  is now one frozen fragment shared by fresh-schema and migration paths. The
  pinned checksum proves the migration bytes remain exactly unchanged. Full
  verification and the installed-Codex test remain green; a fifth wholly fresh
  review is required.
- 2026-07-20: The fifth fresh whole-branch review returned zero actionable
  Standards findings and zero actionable Specification findings. Generic code
  review is clean. Independent product preflight remains required before this
  ticket can be resolved and integrated.
- 2026-07-20: The first independent product preflight returned `NOT READY`
  because whole-source temporary unavailability/recovery and actual retained
  one-shot JSON lacked one public-seam proof. The existing two-session
  restartable fixture now proves all rows retain unchanged structural metadata
  and observation timestamps as `source-unavailable`, receive exactly one
  monotonic commit each, remain no-ops through repeated loss/reconnect, recover
  the same facts once as observed, and reconnect without replay. Production
  one-shot JSON serializes both the retained and recovered snapshots exactly.
  The nine-file focused public suite passes 129 tests; full verification passes
  157 tests plus one intentional skip; the installed-Codex test remains green.
  Fresh generic review and a fresh independent preflight are required.
- 2026-07-20: Final post-fix generic review returned zero actionable Standards
  findings and zero actionable Specification findings. A new independent
  product preflight returned `READY FOR MAINTAINER`: `npm run verify` passed 22
  files and 157 tests with one intentional host-policy skip; the focused
  nine-file public suite passed 129/129; the repaired regression passed alone;
  and the read-only installed-Codex test passed 1/1. Disposable compiled
  text/JSON and real local IPC paths were clean. PID 77857 remained alive and
  untouched. No required human evidence or Ticket 05 blocker remains. This
  resolves the agent-verifiable ticket without claiming the maintainer's
  personal acceptance; visual hierarchy remains the separate readability
  slice and native Windows/Linux execution remains Ticket 10.

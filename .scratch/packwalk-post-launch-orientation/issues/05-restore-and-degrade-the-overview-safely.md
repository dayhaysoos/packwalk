# Restore and degrade the overview safely

Status: claimed
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
  polling evidence retains prior metadata without merging rejected payloads;
  repeated degradation is a no-op and the same valid source fact recovers once.
  Storage migration 3 preserves the immutable migration-2 checksum, validates
  rows and allocator before upgrading an existing v2 overview in place, and
  takes an SQLite-aware `.pre-migration-v3.sqlite` backup. A real
  daemon/SQLite/IPC test closes one
  daemon scope, restores commit N byte-for-byte in a second, commits exact loss
  as N+1 and same-fact recovery as N+2, and reconnects to one current snapshot
  without replay. A separate two-session test proves only the lost identity
  changes. The deterministic suite passes 22 files, 153 tests, and one
  intentional host-policy skip; typecheck, lint, build, and diff checks pass.
  The opt-in installed-Codex test also passes against this machine's real
  persisted source without starting, resuming, or changing a Codex session.
  Fresh generic review and independent product preflight remain required. A
  persistent protocol-v2 daemon must release the shared `packwalk-v2.sqlite`
  writer before protocol v3 can migrate it; PackWalk fails closed and does not
  kill that older daemon. Generic upgrade recovery belongs to Ticket 08.

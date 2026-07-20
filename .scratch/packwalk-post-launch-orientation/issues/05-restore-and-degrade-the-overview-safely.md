# Restore and degrade the overview safely

Status: claimed
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A durable overview that restores after daemon restart and becomes explicitly
stale, uncertain, or unsupported when its Codex evidence can no longer be
observed.

## Acceptance criteria

- [ ] Restarting the PackWalk daemon restores the last committed session view
      from SQLite without recreating, resuming, or changing Codex.
- [ ] PackWalk commit ordering remains monotonic and restored state is not
      presented as a newly observed Codex event.
- [ ] Temporary source loss retains the last supported metadata with explicit
      stale/uncertain provenance and freshness; unsupported evidence is never
      guessed or silently dropped.
- [ ] Reappearance produces a new committed observation through the daemon
      surface without invented replay.
- [ ] Restart, local application-data paths, source loss, and reconnect behavior
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

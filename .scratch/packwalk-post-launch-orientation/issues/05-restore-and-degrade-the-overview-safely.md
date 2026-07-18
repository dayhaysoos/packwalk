# Restore and degrade the overview safely

Status: ready-for-agent
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

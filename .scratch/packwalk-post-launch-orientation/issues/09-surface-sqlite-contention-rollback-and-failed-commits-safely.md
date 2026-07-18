# Surface SQLite contention, rollback, and failed commits safely

Status: ready-for-agent
Blocked by: 05
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

Truthful daemon and client behavior when an authoritative SQLite write cannot
begin, rolls back, or has no successful commit.

## Acceptance criteria

- [ ] Lock contention and busy-timeout exhaustion return typed, redacted
      PackWalk failures through the public daemon surface.
- [ ] A failed or rolled-back transaction neither publishes a session update
      nor advances the authoritative PackWalk commit sequence.
- [ ] PackWalk does not automatically repeat an authoritative command after a
      busy timeout or uncertain transaction outcome.
- [ ] Clients retain the last committed view and visibly distinguish storage
      failure from fresh Codex evidence.
- [ ] Deterministic tests cover representative Windows, macOS, and Linux lock
      and file semantics without depending on host-specific error strings.

This ticket is limited to externally observable failure and recovery behavior,
not exhaustive database-driver qualification.

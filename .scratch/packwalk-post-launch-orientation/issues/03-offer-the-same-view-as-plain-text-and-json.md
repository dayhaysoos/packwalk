# Offer the same view as plain text and JSON

Status: claimed
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

One-shot text and JSON views of the same committed session model shown by the
refreshing CLI, suitable for scrollback, accessibility, and automation.

## Acceptance criteria

- [ ] Both commands query the daemon's public session surface and do not read
      SQLite or Codex evidence directly.
- [ ] Plain text includes project, exact session identity, activity, evidence
      source, freshness, and honest discovered/polled status.
- [ ] JSON is Effect-Schema encoded, versioned, content-free, and stable enough
      for a caller to distinguish unavailable fields from absent data.
- [ ] Neither path requires a terminal UI framework, native UI library, or
      experimental runtime flag.
- [ ] Output and exit behavior are deterministic on Windows, macOS, and Linux,
      including non-TTY execution and platform-native line handling.

## Comments

- 2026-07-20: Claimed on `agent/ticket-03-text-json-output` from fixed
  integration point `6c4686dca30466b52db56785ef159348a28a4d1e`. The delivery
  seams are the daemon's public IPC session stream, one-shot CLI process
  stdout/stderr/exit behavior, and an Effect-Schema encoded versioned JSON
  contract. Both one-shot commands will stop after the daemon's initial public
  event and will not read Codex SQLite or persisted evidence directly.

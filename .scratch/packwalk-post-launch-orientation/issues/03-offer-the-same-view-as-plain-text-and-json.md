# Offer the same view as plain text and JSON

Status: claimed
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

One-shot text and JSON views of the same committed session model shown by the
refreshing CLI, suitable for scrollback, accessibility, and automation.

## Acceptance criteria

- [x] Both commands query the daemon's public session surface and do not read
      SQLite or Codex evidence directly.
- [x] Plain text includes project, exact session identity, activity, evidence
      source, freshness, and honest discovered/polled status.
- [x] JSON is Effect-Schema encoded, versioned, content-free, and stable enough
      for a caller to distinguish unavailable fields from absent data.
- [x] Neither path requires a terminal UI framework, native UI library, or
      experimental runtime flag.
- [x] Output and exit behavior are deterministic on Windows, macOS, and Linux,
      including non-TTY execution and platform-native line handling.

## Comments

- 2026-07-20: Claimed on `agent/ticket-03-text-json-output` from fixed
  integration point `6c4686dca30466b52db56785ef159348a28a4d1e`. The delivery
  seams are the daemon's public IPC session stream, one-shot CLI process
  stdout/stderr/exit behavior, and an Effect-Schema encoded versioned JSON
  contract. Both one-shot commands will stop after the daemon's initial public
  event and will not read Codex SQLite or persisted evidence directly.
- 2026-07-20: Implementation and agent-verifiable acceptance checks are green
  pending independent review. `packwalk text` and `packwalk json` share the
  connect-or-start path, consume exactly one decoded public IPC event, ignore
  terminal capabilities, emit one platform-native-line-ended document, and
  close only the client scope. The JSON document is encoded from the existing
  strict `SessionEvent` schema, whose required `SessionSnapshot.view` and
  required `SessionUnavailable.code`/`message` variants distinguish available
  data from explicit unavailability. Focused verification passed 3 files and
  18 tests; full verification passed 17 files and 75 tests. A compiled
  real-product smoke returned both documents with exit 0, empty stderr, all
  required structural fields, no forbidden content field, and native final
  line endings. Invalid compiled CLI usage returned the fixed usage on stderr
  and exit 1 before runtime setup.

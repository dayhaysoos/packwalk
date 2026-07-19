# Offer the same view as plain text and JSON

Status: ready-for-agent
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

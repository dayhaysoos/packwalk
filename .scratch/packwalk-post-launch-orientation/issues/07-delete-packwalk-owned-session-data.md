# Delete PackWalk-owned session data

Status: ready-for-agent
Blocked by: 03, 06
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A non-OpenTUI command surface for deleting one session's PackWalk-owned current
view and evidence history, plus a separate command for clearing all PackWalk
session data.

## Acceptance criteria

- [ ] Deleting one session atomically removes its PackWalk projection and
      persisted history and publishes the resulting committed view.
- [ ] Clearing all session data removes every PackWalk-owned session projection
      and history fact, including SQLite sidecar effects covered by the
      operation's documented semantics.
- [ ] The commands are explicit, typed, available without OpenTUI or renderer
      FFI, and distinguish missing/already-deleted data from successful change.
- [ ] No deletion path modifies Codex files, sessions, processes, or lifecycle.
- [ ] Deletion remains correct across Windows, macOS, and Linux path, locking,
      and open-file semantics and is observable through plain text and JSON.

# Inspect content-free evidence history

Status: ready-for-agent
Blocked by: 05
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

An inspectable ordered history of structural PackWalk observations that
explains each session status without becoming a second transcript archive.

## Acceptance criteria

- [ ] History exposes structural activity facts, PackWalk commit order,
      observation time, evidence source, provenance, freshness, and explicit
      omission/unsupported facts for one session.
- [ ] Prompts, responses, tool output, command output, diffs, terminal input,
      raw Codex payloads, and raw IPC bodies are rejected at schema boundaries.
- [ ] Inspection uses a public daemon query and can explain the current view
      from committed facts without reaching into SQLite directly.
- [ ] Ordering does not rely on wall-clock timestamps as a causal sequence.
- [ ] History encoding, timestamps, and path metadata have deterministic,
      content-free behavior on Windows, macOS, and Linux.

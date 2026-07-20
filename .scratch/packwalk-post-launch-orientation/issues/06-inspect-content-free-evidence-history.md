# Inspect content-free evidence history

Status: claimed
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

## Comments

- 2026-07-20: Claimed on `agent/ticket-06-content-free-history` from fixed
  integration point `0816410ea854b3a829ac49ee62826b58cc4174c4`. Acceptance
  will be mapped before implementation to: a public daemon/IPC/CLI history
  query for one exact session; ordered committed structural facts that explain
  the current projection; exhaustive Effect-Schema rejection of prohibited
  content and raw payload fields; commit-sequence ordering independent of wall
  clocks; and injected Windows/macOS/Linux encoding, timestamp, and path laws.
  Ticket 06 does not add deletion, generic migration recovery, contention,
  native three-platform qualification, live attachment, intervention, routing,
  searchable transcript history, or raw provider retention.

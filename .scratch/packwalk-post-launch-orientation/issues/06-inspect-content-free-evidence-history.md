# Inspect content-free evidence history

Status: claimed
Blocked by: 05
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

An inspectable ordered history of structural PackWalk observations that
explains each session status without becoming a second transcript archive.

## Acceptance criteria

- [x] History exposes structural activity facts, PackWalk commit order,
      observation time, evidence source, provenance, freshness, and explicit
      omission/unsupported facts for one session.
- [x] Prompts, responses, tool output, command output, diffs, terminal input,
      raw Codex payloads, and raw IPC bodies are rejected at schema boundaries.
- [x] Inspection uses a public daemon query and can explain the current view
      from committed facts without reaching into SQLite directly.
- [x] Ordering does not rely on wall-clock timestamps as a causal sequence.
- [x] History encoding, timestamps, and path metadata have deterministic,
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
- 2026-07-20: Implementation is complete while the ticket remains `claimed`
  for the required generic-review and product-preflight loops. `packwalk inspect
  <exact-session-id> [text|json]` issues a protocol-v4 exact-session daemon
  query, follows fixed 32-fact pages pinned to one `throughCommitSequence`, and
  never refreshes the source or reads PackWalk SQLite from the client. The
  result explains the current view using ordered structural facts and names
  history coverage, omitted content, and unsupported facts explicitly.
- 2026-07-20: Storage migration 4 adds an immutable scalar history table and a
  SQLite-aware `.pre-migration-v4.sqlite` backup. Migration backfill is labelled
  `MigratedBaseline` without inventing a recording timestamp or commit; later
  commits atomically advance the allocator, update the current projection, and
  append a `Committed` fact whose `recordedAtMs` remains distinct from the
  source and observation clocks. Exact identity uses binary equality, and
  causal order is exclusively the global PackWalk commit sequence.
- 2026-07-20: Deterministic coverage includes strict excess-property rejection,
  regressing wall clocks, migration/import/rollback behavior, pagination across
  a concurrent later commit, read-only repeat inspection, daemon restart,
  source loss and recovery, injected Windows/macOS/Linux encoding and path
  laws, and compiled text/JSON commands over real local IPC. The opt-in test
  also crossed an installed Codex persisted update through storage, daemon
  publication, IPC, and public history inspection without changing Codex.
  `npm run verify` passes 26 files, 173 tests, and one intentional host-policy
  skip plus typecheck, lint, and the production build.
- 2026-07-20: A cold real-product command exposed that the former five-second
  client reconnect budget could expire while the new v4 daemon completed its
  first migration and discovery. Both overview and inspection clients now
  allow a bounded thirty-second startup budget. A fresh v4 daemon then served
  the overview and rendered a real exact-session history through the compiled
  CLI, including `prior-history-unavailable` coverage for migrated evidence.
  Only the PackWalk-owned v4 test daemon was restarted; the pre-existing
  protocol-v1 daemon PID 77857 remained alive and untouched.
- 2026-07-20: Fresh generic review pass 1 reported four Standards findings and
  one Specification finding. Red regressions reproduced crossed-session
  unavailable responses both immediately and after a valid first page. Every
  response is now checked against the requested exact identity before tag
  handling; one domain comparator owns view equality across schema, storage,
  and IPC; one shared terminal-text module owns escaping and UTC rendering;
  README now distinguishes the accepted tracer bullet from pending Ticket 06;
  and `docs/current-state.md` names the actual Ticket 05 integration head. All
  five findings are corrected. The focused four-file suite passes 21 tests,
  and `npm run verify` passes 26 files, 172 tests, and one intentional skip plus
  typecheck, lint, and build. A wholly fresh generic review remains.
- 2026-07-20: Fresh generic review pass 2 is clean on Specification and found
  one Standards truthfulness gap: retry spacing alone did not bound total
  elapsed startup because each IPC attempt has its own open timeout. A red
  virtual-clock regression proved the command could remain pending at the
  claimed deadline. `connectOrStart` now wraps the initial attempt, daemon
  start, retry delays, and connection attempts in one explicit elapsed
  deadline; both CLI paths supply thirty seconds. The focused deadline suite
  passes three tests, and `npm run verify` passes 26 files, 173 tests, and one
  intentional skip plus typecheck, lint, and build. Another wholly fresh
  generic review remains.

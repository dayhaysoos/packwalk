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
- 2026-07-20: Generic review pass 1 reported zero Specification findings and
  two Standards findings. CLI arguments are now decoded through one strict
  Effect Schema before mapping to an internal `Refresh` or
  `OneShot { format }` command, satisfying the repository's command-validation
  authority. The single `OneShot` branch also removes duplicated text/JSON
  output pipelines. Focused tests and typecheck are green; a fresh independent
  review is required after full verification.
- 2026-07-20: After the corrections, full verification remained green at 17
  files and 75 tests and the compiled public-command smoke passed again with a
  real `POLLED` snapshot. Fresh generic review pass 2 is clean with zero
  Standards and zero Specification findings. Ticket 03 now awaits independent
  product preflight; no maintainer acceptance is claimed.
- 2026-07-20: Independent product preflight reported `NOT READY` because the
  originally documented `npm run packwalk -- text|json` repository wrapper
  prepended npm lifecycle lines to stdout even though the PackWalk payload
  itself was correct. The README now uses `npm run --silent packwalk -- text`
  and `npm run --silent packwalk -- json`. A new isolated process-level
  regression starts a real local IPC server, executes those exact documented
  commands with redirected output, and proves six clean text lines, one
  directly parseable schema-shaped JSON document, native final line endings,
  empty stderr, exit 0, and fixed invalid-usage stdout/stderr/exit behavior.
  The focused regression is green; full verification, fresh generic review,
  and a fresh product preflight remain required.
- 2026-07-20: Generic review pass 3 remained clean on Specification and found
  two Standards issues. The catch-all failure now truthfully says only that the
  local session command could not complete instead of mislabelling encoding,
  empty-stream, or output errors as connection failures. The process-level
  regression now gives each documented command a 30-second bound, terminates
  its isolated process tree on timeout on POSIX and Windows, tracks active
  children for final cleanup, and has an explicit 120-second test budget for
  three builds. Focused tests, typecheck, and lint are green; full verification
  and a fresh review remain required.
- 2026-07-20: Generic review pass 4 remained clean on Specification and found
  that the first timeout repair still waited on an unbounded child `close` and
  did not await or check Windows `taskkill`. The process runner now races every
  command against its own deadline, awaits a bounded POSIX process-group
  `SIGTERM` then `SIGKILL` sequence or checked Windows `taskkill /T` then `/F`,
  independently bounds owner closure, retains failed cleanups for a final
  awaited retry, and reports cleanup failure. A disposable nested-process
  regression proves the 200-millisecond timeout path removes the full process
  group inside a 10-second test budget. Focused tests, typecheck, and lint are
  green. Focused verification passes 4 files and 20 tests; full verification
  passes 17 files and 76 tests. A fresh review remains required.
- 2026-07-20: Generic review pass 5 remained clean on Specification and found
  two final cleanup defects: Windows owner exit was treated as tree-exit proof,
  and losing deadline timers were not cancelled. Timeout cleanup now always
  runs and checks `taskkill /T`, escalates to `/F` when graceful owner closure
  misses its bound, and fails visibly if neither proves tree cleanup. One shared
  deadline race clears its timer in `finally` for both product commands and
  cleanup helpers. Focused tests, typecheck, and lint are green; full
  verification and a fresh review remain required.
- 2026-07-20: Generic review pass 6 remained clean on Specification and found
  two Standards gaps in the test harness: the timeout regression observed only
  the process-tree owner rather than its descendant, and process supervision
  made the product-output test span unrelated responsibilities. Process
  supervision now lives in a cohesive test support module. The timeout fixture
  publishes its disposable descendant identity, and the regression
  independently proves that descendant no longer exists after cleanup; that
  identity is not retained in delivery records. The two focused process tests
  are green, and full verification passes 18 files and 76 tests plus typecheck,
  lint, and build. A fresh independent review remains required.
- 2026-07-20: Generic review pass 7 is clean on Standards and found one
  Specification blocker in the regression rather than the product: Windows
  cannot directly spawn the selected `npm.cmd` shim without a shell, so that
  platform would fail before asserting one-shot streams and exit behavior. A
  red-capable pure invocation test now locks in Windows-style paths with spaces.
  The documented npm wrapper is executed through the current Node executable
  and npm's JavaScript entry point, preserving `run --silent packwalk --` while
  avoiding shell quoting and direct command-shim execution. Three focused tests
  are green; full verification passes 19 files and 77 tests plus typecheck,
  lint, and build. Another fresh review remains required.
- 2026-07-20: Fresh generic review pass 8 is clean with zero actionable
  Standards findings and zero Ticket 03 Specification findings across the
  complete fixed-point diff through `3553d49d97f7428a4928e8102693da81e5a1f2fc`.
  The independent product preflight is now the remaining delivery gate; no
  maintainer acceptance is claimed.
- 2026-07-20: Independent product preflight reports `READY FOR MAINTAINER` at
  `6493aa8a6bc8ce250b52c8509f366cff9a4d9612`. It exercised the exact documented
  quiet commands through the public daemon surface: text returned one complete
  six-line `POLLED` view with empty stderr, JSON returned one directly parseable
  versioned content-free snapshot, and invalid usage returned empty stdout,
  exact native-line-ended stderr, and exit 1. Six focused Ticket 03 files and
  21 tests passed; full verification passed 19 files and 77 tests plus
  typecheck, lint, and build. Explicit unavailable output, CRLF behavior, and a
  Windows path containing spaces have deterministic coverage. Real execution
  occurred on macOS arm64; Windows and Linux real-process evidence remains for
  the accumulated Ticket 10 matrix. That limitation is non-blocking for this
  ticket. Ticket 03's agent-owned delivery is resolved and ready to integrate;
  no personal maintainer acceptance is claimed.
- 2026-07-20: Final generic review pass 9 is clean on Standards and found one
  documentation-only Specification inconsistency: the opening current-state
  summary presented intermediate 17-file verification and a pending preflight
  beside the final 19-file `READY FOR MAINTAINER` result without identifying
  the former as delivery history. Ticket 03 is temporarily reclaimed while the
  handoff opening is made authoritative and the intermediate review chronology
  is explicitly labelled. Product behavior is unchanged; full verification
  again passes 19 files and 77 tests plus typecheck, lint, and build. Another
  fresh review remains required.

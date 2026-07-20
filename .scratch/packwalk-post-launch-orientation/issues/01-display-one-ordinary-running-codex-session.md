# Display one ordinary running Codex session

Status: ready-for-agent
Blocked by: none
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A smallest possible vertical slice: after an ordinary Codex TUI is already
running, PackWalk starts independently, discovers exactly one session from
persisted local evidence, stores one minimal current view, exposes it through
the daemon's public session seam, renders it in one plain CLI view, and visibly
updates once after polling detects later Codex activity.

## Acceptance criteria

- [x] Starting PackWalk neither launches nor changes the lifecycle of Codex and
      requires no wrapper, `--remote`, PackWalk-owned app-server, or relay.
- [x] Exactly one discovered session is represented by project, exact Codex
      session identity, supported activity, evidence source, observation time,
      freshness, and an honest `discovered` or `polled` status.
- [x] SQLite holds one minimal content-free current-session representation;
      prompts, responses, tool output, diffs, terminal input, and raw Codex
      payloads cannot enter it.
- [x] The daemon's public session query/event surface returns the initial
      committed view and one committed update after the deterministic source
      changes.
- [x] One compact plain CLI table consumes that public surface, visibly presents
      the real project, exact session identity, supported activity, evidence
      source, freshness, observation/update time, and honest state, and, on a
      capable terminal with enough width, refreshes the same lines after the
      polling update without claiming the session is live or watched. Other
      outputs remain readable by appending plain-text tables.
- [x] The Node package exposes a binary named `packwalk`, and one documented
      repository-local command starts or connects to the required daemon,
      opens the plain CLI view, and performs the complete demonstration without
      manual startup of additional PackWalk components.
- [x] Deterministic tests exercise behavior only through the approved daemon
      seam. An opt-in real-Codex integration check performs the same discovery
      and one polling update against an ordinary session started first.
- [x] The repository documents the exact demonstration, deterministic-test,
      and opt-in real-Codex-check commands needed for a maintainer to reproduce
      acceptance personally.
- [x] Paths, application-data discovery, and process/transport choices contain
      no macOS-only assumptions; unsupported evidence fails visibly on Windows,
      macOS, or Linux rather than being guessed.
- [ ] A maintainer has personally started an ordinary Codex TUI first, run
      `npm run packwalk`, and observed the real initial view and a later
      persisted polling update.

## Scope guard

Do not add multi-session behavior, schema migrations, evidence history, live
attachment, consequential actions, release packaging, or generalized provider,
storage, transport, or presentation frameworks in this ticket.

A globally installed standalone `packwalk` executable remains out of scope;
repository-local execution of the package binary is required.

## Comments

- 2026-07-18: Implementation is ready for personal acceptance. `npm run
  verify` passes 15 deterministic files and 58 tests plus typecheck, lint, and
  a clean production build. The opt-in real-Codex integration check passes.
  A cold-daemon run of `npm run packwalk` verified automatic startup, and a
  terminal run of the corrected compact table redrew the same two lines after
  real persisted updates. Keep this ticket open until the maintainer
  reproduces that documented command.
- 2026-07-19: Maintainer acceptance is reopened. During a later real use, the
  table did not visibly update while Codex activity continued. Polling must not
  be described as trustworthy live or real-time attachment, but this ticket
  still requires a visible new frame after the supported Codex persisted source
  changes. Diagnose the source poll, committed daemon publication, IPC delivery,
  and terminal redraw seams; deterministic tests do not override the failed
  personal demonstration.
- 2026-07-19: Documentation review also found that the current compact table
  deliberately omits exact session identity, evidence source, and freshness
  even though the maintainer's accepted runnable demonstration requires those
  fields to be visible. The PackWalk public view already carries them; Ticket 01
  remains open until its human CLI presents them as well as visibly polling.
- 2026-07-19: Agent-verifiable implementation is complete on
  `agent/ticket-01-acceptance` and the required review gates are in progress.
  Diagnosis reproduced two real failures: a persistent daemon remained pinned
  to an older singleton (and a cold restart rejected the newly discovered
  identity), while second-only CLI timestamps could make distinct subsecond
  commits render identically. Each CLI subscription now refreshes the existing
  one-session discovery before returning its snapshot, and a different
  supported identity replaces only that singleton while preserving monotonic
  commit order. The six-line plain table shows project, exact session identity,
  activity, evidence, freshness, millisecond source-update time, observation
  time, and honest state without adding multi-session or live behavior.
  `npm run verify` passes 15 deterministic files and 65 tests. A real cold start
  from the previously failing persisted state, followed by a reconnect to the
  surviving daemon, both selected the active PackWalk task and visibly rendered
  later persisted source updates. The maintainer criterion remains unchecked.
- 2026-07-19: Review pass 2 found that a daemon which had already published
  `SessionUnavailable` could skip later subscribe-time discovery, and that the
  README still described the superseded four-field table. The daemon now keeps
  its last committed one-session view separate from public availability, so a
  later subscription can recover either startup discovery or a source-lost
  poll and then resume exact-identity polling. Deterministic public-seam tests
  cover both recovery cases, and the README now carries the same exact
  maintainer demonstration as this ticket and `docs/current-state.md`. Full
  verification is green; fresh generic review remains in progress.
- 2026-07-19: Review pass 3 was standards-clean and found one remaining spec
  evidence gap: the source-loss test stopped at `SessionUnavailable`. The
  public daemon/IPC test now proves initial snapshot, failed exact-identity
  poll, typed unavailable event, restored evidence, reconnect snapshot for the
  same session, and a later committed `SessionUpdated` after polling resumes.
  `npm run verify` remains green; a fresh full-branch review is required before
  product preflight.

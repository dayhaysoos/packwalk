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
- [ ] One compact plain CLI table consumes that public surface, visibly presents
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

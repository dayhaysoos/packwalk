# Display one ordinary running Codex session

Status: ready-for-agent
Blocked by: none
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A smallest possible vertical slice: after an ordinary Codex TUI is already
running, PackWalk starts independently, discovers exactly one session from
persisted local evidence, stores one minimal current view, exposes it through
the daemon's public session seam, renders it in one OpenTUI view, and visibly
updates once after polling detects later Codex activity.

## Acceptance criteria

- [ ] Starting PackWalk neither launches nor changes the lifecycle of Codex and
      requires no wrapper, `--remote`, PackWalk-owned app-server, or relay.
- [ ] Exactly one discovered session is represented by project, exact Codex
      session identity, supported activity, evidence source, observation time,
      freshness, and an honest `discovered` or `polled` status.
- [ ] SQLite holds one minimal content-free current-session representation;
      prompts, responses, tool output, diffs, terminal input, and raw Codex
      payloads cannot enter it.
- [ ] The daemon's public session query/event surface returns the initial
      committed view and one committed update after the deterministic source
      changes.
- [ ] One lightweight OpenTUI view consumes that public surface and visibly
      changes after the polling update without claiming the session is live or
      watched.
- [ ] The Node package exposes a binary named `packwalk`, and one documented
      repository-local command starts or connects to the required daemon,
      opens the OpenTUI client, and performs the complete demonstration without
      manual startup of additional PackWalk components.
- [ ] Deterministic tests exercise behavior only through the approved daemon
      seam. An opt-in real-Codex integration check performs the same discovery
      and one polling update against an ordinary session started first.
- [ ] The repository documents the exact demonstration, deterministic-test,
      and opt-in real-Codex-check commands needed for a maintainer to reproduce
      acceptance personally.
- [ ] Paths, application-data discovery, and process/transport choices contain
      no macOS-only assumptions; unsupported evidence fails visibly on Windows,
      macOS, or Linux rather than being guessed.

## Scope guard

Do not add multi-session behavior, schema migrations, evidence history, live
attachment, consequential actions, release packaging, or generalized provider,
storage, transport, or UI frameworks in this ticket.

A globally installed standalone `packwalk` executable remains out of scope;
repository-local execution of the package binary is required.

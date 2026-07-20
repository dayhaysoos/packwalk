# Attempt one post-launch live Codex event

Status: claimed
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

One bounded experiment, completable in one fresh implementation session, that
tests whether PackWalk can correlate one newly emitted live event to the exact
ordinary Codex session that was already running when PackWalk started.

This experiment decides what PackWalk may truthfully call `watched`; it does
not redefine PackWalk as permanently read-only. The intended intervention
direction remains recorded in
[ADR 0003](../../../docs/adr/0003-define-post-launch-supervision-and-intervention.md),
while actual control stays unavailable until an exact observation and control
path is separately qualified.

## Acceptance criteria

- [ ] The experiment begins with an ordinary Codex TUI, starts PackWalk later,
      and does not introduce a wrapper, `--remote` prerequisite, PackWalk-owned
      app-server or relay, session creation, resume, restart, or replacement.
- [ ] Success requires one trustworthy post-launch event correlated to the
      exact discovered session; weaker evidence is recorded as a negative
      result and cannot produce `watched` status.
- [ ] The result records exact Codex and PackWalk versions, tested mechanism,
      platform/architecture, reproduction steps, observed evidence, and the
      reason the conclusion is supported.
- [ ] A negative result is considered complete, does not block the polling
      product, explicitly records that live watched status and direct control
      remain unavailable, and identifies concrete next options.
- [ ] A positive result records evidence only; production `watched` status and
      direct control still require a separate approved implementation decision.
- [ ] No qualification harness, Wayfinder campaign, or speculative production
      abstraction is created.
- [ ] The report makes no portability claim beyond tested evidence and names
      what would require separate Windows, macOS, and Linux qualification.

## Comments

- 2026-07-20: Claimed on `agent/ticket-02-live-event-experiment` from fixed
  integration point `e7c7808f4b0ba1b90803634a7f8613beffb96383`. The
  experiment will qualify one post-launch event against the installed Codex
  release without changing ordinary session lifecycle. A rigorous negative
  result remains an accepted resolution and will not block Tickets 03–10.

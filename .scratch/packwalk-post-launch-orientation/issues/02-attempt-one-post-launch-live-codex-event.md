# Attempt one post-launch live Codex event

Status: ready-for-agent
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

One bounded experiment, completable in one fresh implementation session, that
tests whether PackWalk can correlate one newly emitted live event to the exact
ordinary Codex session that was already running when PackWalk started.

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

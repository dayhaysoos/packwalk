# Keep overlapping Codex sessions distinct

Status: claimed
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A multi-session overview that never mixes identity or activity when Codex
sessions overlap, share a repository, or have duplicate display labels.

## Acceptance criteria

- [ ] At least two concurrently discoverable sessions appear as distinct rows
      through the daemon surface and CLI view.
- [ ] Two sessions in one repository remain distinct by exact Codex identity;
      project paths and human labels are not used as session identity.
- [ ] A polling change for one session cannot alter another session's activity,
      evidence, freshness, or commit identity.
- [ ] Ambiguous or duplicate source evidence fails visibly instead of being
      attached to an arbitrary session.
- [ ] Identity and path comparisons have explicit Windows, macOS, and Linux
      behavior, including platform case and separator differences.

## Comments

- 2026-07-20: Claimed on `agent/ticket-04-overlapping-sessions` from fixed
  integration point `31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8`. Acceptance
  will be proved through the daemon's public session stream and CLI view with a
  deterministic overlapping-session source, exact-identity storage/projection
  isolation, a visible ambiguous-evidence failure, and injected-platform path
  comparison contracts for Windows, macOS, and Linux. Ticket 04 does not add
  restoration, history, deletion, live attachment, intervention, or routing.

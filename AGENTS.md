# Agent Instructions

## Verify the repository before editing

Run these checks before any mutation:

```sh
git rev-parse --show-toplevel
git remote get-url origin
git status --short --branch
```

The repository must be `dayhaysoos/packwalk`. Work in its normal checkout or a
deliberate Git worktree attached to it. Never leave accepted work only in an
untracked temporary clone, and never treat the historical Agent Watch checkout
as PackWalk authority.

## Read authority in this order

1. `docs/product.md` — complete product intent.
2. `CONTEXT.md` — canonical domain vocabulary only.
3. `docs/roadmap.md` and `docs/current-state.md` — intended ordering and what
   actually exists today.
4. `docs/adr/README.md` and relevant accepted ADRs — durable architecture and
   boundary decisions.
5. The active `.scratch/` specification and exact ticket — delivery scope for
   the current slice.
6. `docs/history/agent-watch-lineage.md` only when historical provenance is
   relevant.

An active ticket's “out of scope” section limits that ticket. It does not erase
capabilities accepted by the product model or ADRs. If sources conflict, stop
and surface the exact contradiction rather than silently choosing one.

## Product boundary checkpoint

PackWalk is currently implemented as a read-only polling CLI, but it is intended
to become a local post-launch supervision and intervention product with
exact-target ask, steer, approve, reject, and interrupt operations. Its intended
natural-language surface uses one fresh stateless Codex routing turn per
request. Remote supervision is a bonus horizon after the local core succeeds.

PackWalk does not own Codex session lifecycle, and starting idle turns or new
work requires a separate future product decision.

## Issue tracker

Issues and specs are versioned Markdown under `.scratch/`. See
`docs/agents/issue-tracker.md`. Do not duplicate them as GitHub Issues.

## Domain and triage

This is a single-context repository. Follow `docs/agents/domain.md` and use the
default five-role vocabulary in `docs/agents/triage-labels.md`.

## Maintainer publication

Follow `docs/agents/publishing.md`. On the configured maintainer environment,
verify `gh-day` resolves to `dayhaysoos` and push with `git-day`. Never fall
back to bare `gh` or unrelated cached Git credentials.

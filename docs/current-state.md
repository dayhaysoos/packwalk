# PackWalk current state

Last updated: 2026-07-19

This is the handoff entry point for what exists today. Product direction lives
in [the product model](product.md), domain language in
[the glossary](../CONTEXT.md), and durable technical decisions in
[the ADR index](adr/README.md).

## Canonical repository

The public source target is exactly
[`dayhaysoos/packwalk`](https://github.com/dayhaysoos/packwalk). Before changing
anything, verify that the current checkout or deliberate Git worktree belongs
to that repository:

```sh
git rev-parse --show-toplevel
git remote get-url origin
git status --short --branch
```

Accepted work must not exist only in an untracked temporary clone. Temporary
directories remain appropriate for disposable fixtures and tests, not as the
sole home of source changes.

## Implemented baseline

Commit `d8cc9412687e91ff9182e5d1a24ff9d0eb1b0efa` introduced the first polling
CLI implementation:

- one independently discovered Codex session;
- a minimal content-free PackWalk SQLite view;
- a daemon-owned public session query/event stream;
- a plain refreshing CLI client;
- deterministic daemon-seam tests;
- an opt-in real-Codex persisted-source check; and
- repository-local `packwalk` package execution.

The implementation uses the pinned Node, Effect v4, Effect Schema, and
`node:sqlite` stack. It does not contain a terminal UI framework, native
renderer, Bun runtime, consequential action, natural-language router, or remote
client.

## Active acceptance issue

[Ticket 01](../.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)
is in final agent review on `agent/ticket-01-acceptance`. The maintainer's
failed demonstration was reproduced: a persistent daemon could remain pinned
to an older singleton, and a cold restart then rejected a newly discovered
identity. Separately, second-only CLI timestamps could render distinct
subsecond polling commits identically.

Polling is not trustworthy live observation and should not be described as
real-time attachment. It must nevertheless publish and visibly render a new
committed frame after the supported Codex persisted source changes. The report
must be diagnosed through the source, daemon publication, IPC stream, and CLI
redraw seams before personal acceptance can be restored.

The branch now refreshes the existing one-session discovery when a CLI
subscribes, replaces only that singleton when supported discovery identifies a
different session, and preserves monotonic PackWalk commit order. It does not
enumerate, display, or poll multiple sessions concurrently. The compact
six-line table now shows project, exact session identity, activity, evidence
source, freshness, millisecond source-update time, observation time, and honest
state. It also retains the last committed singleton separately from a public
unavailable event, allowing a later CLI subscription to recover startup
discovery or a source-lost poll before exact-identity polling resumes. The
README now documents this same complete table and maintainer demonstration.
Deterministic verification (15 files, 65 tests) and a real
cold-start-plus-reconnect exercise are green; fresh generic code review and
independent product preflight remain before the issue can move to
maintainer-only acceptance.

## Reproduce

Use the exact versions pinned by the repository:

```sh
npm ci
npm run packwalk
```

Start an ordinary Codex TUI and complete one turn before `npm run packwalk`.
Confirm the displayed project and exact session identity, note `SOURCE UPDATED`,
then complete another turn in that same Codex session. After Codex persists the
activity and polling observes it, PackWalk must keep the same `SESSION`, show
`POLLED`, and render a later `SOURCE UPDATED` value. A capable terminal with
enough width refreshes the same six lines; narrow, non-TTY, or cursor-disabled
output appends another complete plain-text table. Neither path is live or
real-time observation.

Run the complete deterministic verification with:

```sh
npm run verify
```

Run the opt-in real-Codex source check with an ordinary Codex session already
running:

```sh
npm run test:real-codex
```

## Not implemented

- accepted multi-session behavior beyond the one-session tracer bullet;
- trustworthy post-launch live attachment or `watched` status;
- deterministic ask, steer, approve, reject, or interrupt commands;
- the persistent PackWalk action ledger;
- stateless natural-language routing;
- remote web, mobile, or cross-device supervision; and
- standalone release packaging.

These missing capabilities are distinguished between intended product work and
bonus horizons in [the roadmap](roadmap.md). Their absence from the current code
does not redefine PackWalk as permanently read-only.

## Next work

1. Complete fresh generic code review and independent product preflight for
   Ticket 01, fixing and re-reviewing every blocker.
2. Have the maintainer personally rerun the repository command.
3. Only after Ticket 01 resolves, begin the bounded Ticket 02 live-event
   experiment.

## Fresh-agent comprehension check

A fresh agent using only this repository should be able to state all of the
following without inspecting old commits or another checkout:

1. PackWalk is read-only today but is not intended to remain read-only.
2. Its intended local interventions are exact-target ask, steer, approve,
   reject, and interrupt operations after qualification.
3. Every natural-language request uses one fresh, small Codex routing turn with
   no persistent PackWalk model state or dispatch authority.
4. PackWalk assists independently started sessions and does not currently own
   session lifecycle or start idle work.
5. Remote web, mobile, and cross-device supervision is a bonus horizon after
   the successful local core, not a current blocker.
6. Ticket 01's agent-verifiable implementation is complete on its acceptance
   branch, but required review gates and the maintainer's personal real-product
   observation remain before resolution.

An answer that defines PackWalk as a permanently read-only viewer, revives a
wrapper or relay, grants the routing model action authority, or treats remote
architecture as current scope has failed the handoff.

Update this file whenever implementation status, the active ticket, or a known
acceptance blocker changes.

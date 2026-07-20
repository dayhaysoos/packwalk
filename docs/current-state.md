# PackWalk current state

Last updated: 2026-07-20

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

## Accepted first tracer bullet

[Ticket 01](../.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)
is maintainer-accepted and resolved. In one continuously running CLI, the same
exact session advanced from source timestamp `2026-07-20T05:21:21.577Z` to
`2026-07-20T05:30:29.700Z` without restarting PackWalk; the later update was
committed and redrawn in place.

The accepted repair addressed two real failures: a persistent daemon could
remain pinned to an older singleton, and a cold restart then rejected a newly
discovered identity. Separately, second-only CLI timestamps could render
distinct subsecond polling commits identically. Polling remains delayed
persisted observation rather than trustworthy live or real-time attachment.

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
The public daemon/IPC recovery test continues past `SessionUnavailable` through
evidence restoration, reconnect, and a later exact-identity committed update.
Deterministic verification (15 files, 65 tests), the opt-in real-Codex check,
and bounded cold-start-plus-reconnect exercises are green. Final generic review
is clean with zero Standards and zero Ticket 01 specification findings.
Independent product preflight reported `READY FOR MAINTAINER`. The maintainer's
accepted demonstration now supplies the remaining capable-terminal in-place
redraw evidence.

The six-line singleton display still has weak visual hierarchy and makes a new
update difficult to notice. This is non-blocking product feedback for a
separate readability slice after the multi-session shape exists; it does not
reopen Ticket 01 polling.

## Active delivery

The accepted Ticket 01 slice is published on `main` at
`e7c7808f4b0ba1b90803634a7f8613beffb96383`, and
`integration/full-local-product` starts from that same commit.

[Ticket 02](../.scratch/packwalk-post-launch-orientation/issues/02-attempt-one-post-launch-live-codex-event.md)
is `needs-info` on `agent/ticket-02-live-event-experiment`. Static inspection
of standalone Codex `0.139.0` on macOS arm64 found exact-ID notifications but
no post-launch attach or subscribe request. Binary symbols distinguish an
in-process TUI app-server client from a remote client, while documented
externally connectable surfaces require launch-time `--remote` or a separately
managed app-server. This narrows the supported protocol surface but does not
establish the runtime topology of an ordinary default TUI that was already
running.

No ordinary TUI process was running during the bounded topology check. The
remaining Ticket 02 evidence is therefore one maintainer-started default TUI
and a structural process/listener snapshot determining whether that process
exposes a supported endpoint correlated to the exact session. Until then, the
runtime conclusion is unavailable. Persisted evidence remains `discovered` or
`polled`; production `watched` status and direct control remain unavailable.
This human-only check does not block Tickets 03–10.

Final Ticket 02 review is clean with zero Standards and zero Specification
findings. Independent product preflight reports `NEEDS HUMAN EVIDENCE`: no
product failure was established, and every safe check was exhausted. The only
remaining evidence is the maintainer-started default-TUI snapshot documented in
the ticket. No production code or `watched` state was added.

[Ticket 03](../.scratch/packwalk-post-launch-orientation/issues/03-offer-the-same-view-as-plain-text-and-json.md)
is claimed on `agent/ticket-03-text-json-output` from integration fixed point
`6c4686dca30466b52db56785ef159348a28a4d1e`. Its implementation is green and
awaiting independent review. `packwalk text` and `packwalk json` consume exactly
the same initial public daemon event as the refreshing CLI, emit one
platform-native-line-ended document, and exit without affecting the daemon.
JSON uses the existing strict, versioned `SessionEvent` schema and preserves an
explicit tagged unavailable result rather than optional session fields. Direct
Codex or SQLite reads remain outside the client boundary. Deterministic
verification passes 17 files and 75 tests; a compiled real-product smoke passed
for both available one-shot forms and invalid-argument failure behavior.
Generic review pass 1 found no Ticket 03 Specification issue and required two
Standards corrections: CLI argv now passes through a strict Effect Schema, and
one `OneShot { format }` command owns the shared text/JSON execution path. Those
corrections are implemented and awaiting fresh review.

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

1. Keep Ticket 02's exact ordinary-TUI topology snapshot open as non-blocking
   human evidence.
2. Continue with Ticket 03 and then Tickets 04–10 in dependency order,
   including a
   separate readability slice after the multi-session shape exists.

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
6. Ticket 01 is maintainer-accepted and resolved; the remaining local product
   continues through the polling, intervention-qualification, and routing
   phases without reopening its polling result.

An answer that defines PackWalk as a permanently read-only viewer, revives a
wrapper or relay, grants the routing model action authority, or treats remote
architecture as current scope has failed the handoff.

Update this file whenever implementation status, the active ticket, or a known
acceptance blocker changes.

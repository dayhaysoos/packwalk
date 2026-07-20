# PackWalk

PackWalk is a local, post-launch supervision and intervention product for
ordinary Codex sessions that the user started independently. It provides one
truthful place to understand where attention belongs and is intended to add
safely qualified asking, steering, approval, rejection, and interruption
without owning the lifecycle of the Codex sessions it assists.

## Status

PackWalk's current implementation is a read-only polling slice. It discovers
one existing Codex session, persists a content-free current view, exposes it
through the PackWalk daemon, and displays polling updates in a plain command-line
view. It does not yet establish trustworthy live attachment or perform a
consequential action.

Read-only behavior is the current delivery state, not PackWalk's permanent
product boundary. The intended local product progresses from truthful
orientation to exact-target intervention across multiple independently started
Codex sessions. See the [product model](docs/product.md) and
[roadmap](docs/roadmap.md).

## Product boundary

PackWalk starts independently after Codex. It must not require a wrapper
command, `--remote` preconfiguration, a PackWalk-owned app-server or relay, or
PackWalk creation, resumption, restart, replacement, or relaunch of a Codex
session. Starting an idle turn or otherwise initiating new work is not part of
the current intent and requires a separate future product decision.

A persisted or polled session is labelled accordingly. `watched` is reserved
for a separately qualified, trustworthy post-launch live attachment.
Consequential actions require an exact target and a qualified observation and
control path before PackWalk may offer them.

Codex is the only supported agent. PackWalk does not contain a provider
registry or speculative provider architecture.

## Intended interaction

PackWalk will first expose supported actions through deterministic commands.
Its intended agent-powered CLI then accepts requests such as “steer the XYZ
project with ABC information” through one fresh, small Codex routing turn per
request. That routing turn has no conversation history or persistent model
state. It may propose a typed intent, but deterministic PackWalk code retains
authority for exact targeting, ambiguity rejection, eligibility, confirmation,
commit, and dispatch.

Remote supervision from web, mobile, or another device is an intentional bonus
direction after the local product is proven. It is not a current release
requirement. See the [remote-supervision opportunity](docs/future/remote-supervision.md).

## Run the polling slice

Use the exact Node.js `26.5.0` and npm `11.17.0` versions pinned by the
repository, then install the exact lockfile once:

```sh
npm ci
```

Start at least one ordinary Codex TUI independently, before PackWalk. From this
repository, the single PackWalk command is:

```sh
npm run packwalk
```

That command builds the package binary, starts or connects to the PackWalk
daemon automatically, and opens the plain CLI view. Do not start a separate
daemon. Continue working in the original Codex session. After Codex persists a
supported change, the polling slice is expected to refresh the compact table
row with its project name, honest state, activity, and updated time. Press
Ctrl-C to close the CLI. On redirected output, a dumb terminal, or a terminal
too narrow for the table, each update is printed as a new plain-text table.
This does not stop or change Codex.

A newly discovered view is labelled `discovered`; its first successful reread
and later persisted changes are labelled `polled`. Neither label claims live
attachment or direct control.

The real-session presentation is currently awaiting renewed maintainer
acceptance: continuing Codex activity did not visibly update in a later run,
and the compact table omits required session identity, evidence-source, and
freshness fields that already exist in the daemon view. See
[current state](docs/current-state.md) and
[Ticket 01](.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md).

## Verify the current implementation

Run the deterministic tests, type check, lint, and production build with:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

The following check is intentionally opt-in because it needs an ordinary Codex
session to be running first. Start the check, then create additional activity
in that already-running session before the 110-second timeout:

```sh
npm run test:real-codex
```

The integration check reads only structural fields from Codex's local SQLite
thread index, opens it read-only and query-only, and stores the PackWalk view in
an isolated temporary database. It does not create, resume, restart, or start a
turn in Codex and does not require special Codex launch options.

## Project record

- [Product model](docs/product.md)
- [Domain language](CONTEXT.md)
- [Roadmap](docs/roadmap.md)
- [Current state and handoff](docs/current-state.md)
- [Architecture decisions](docs/adr/README.md)
- [Agent Watch lineage](docs/history/agent-watch-lineage.md)
- [Active polling specification](.scratch/packwalk-post-launch-orientation/spec.md)
- [First implementation ticket](.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)

## Source availability

PackWalk's current source revision is publicly visible. No license has been
selected for this revision, and it does not grant reuse rights.

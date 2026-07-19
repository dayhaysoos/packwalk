# PackWalk

PackWalk is a local supervision tool for ordinary Codex sessions that are
already running. It starts independently with truthful, read-only orientation
and is intended to add explicitly supported control actions without owning the
session or changing how Codex was launched.

## Status

PackWalk is currently specified for its first implementation slice. That
read-only slice discovers one existing Codex session, persists a content-free
current view, exposes it through the PackWalk daemon, and displays polling
updates in a plain command-line view. It does not yet start Codex work, attach
live, or control a session.

## Product boundary

PackWalk must not require a wrapper command, `--remote` preconfiguration, a
PackWalk-owned app-server or relay, or PackWalk creation, resumption, restart,
replacement, or relaunch of a Codex session. A persisted or polled session is
labelled accordingly; `watched` is reserved for a separately qualified,
trustworthy post-launch live attachment. Consequential actions such as asking,
steering, approving, rejecting, or interrupting require an exact target and a
separately qualified observation and control path before PackWalk may offer
them.

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
daemon. Continue working in the original Codex session; after Codex persists
additional activity, the CLI refreshes the same compact table row with its
project name, honest state, activity, and updated time. Press Ctrl-C to close
the CLI. On redirected output, a dumb terminal, or a terminal too narrow for
the table, each update is printed as a new plain-text table instead. This does
not stop or change Codex.

A newly discovered view is labelled `discovered`; its first successful reread
and later persisted changes are labelled `polled`. Neither label claims live
attachment or direct control.

## Verify Ticket 01

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
- [Architecture decisions](docs/adr/README.md)
- [Active specification](.scratch/packwalk-post-launch-orientation/spec.md)
- [First implementation ticket](.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)

## Source availability

PackWalk's current source revision is publicly visible. No license has been
selected for this revision, and it does not grant reuse rights.

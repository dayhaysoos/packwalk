# PackWalk

PackWalk is a local, post-launch supervision and intervention product for
ordinary Codex sessions that the user started independently. It provides one
truthful place to understand where attention belongs and is intended to add
safely qualified asking, steering, approval, rejection, and interruption
without owning the lifecycle of the Codex sessions it assists.

## Status

PackWalk's accepted first implementation is a read-only polling slice. It
discovers supported existing Codex sessions, persists a content-free
multi-session overview, exposes it through the PackWalk daemon, and displays
polling updates in a plain command-line view without mixing exact identities.
It does not yet establish trustworthy live attachment or perform a
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

Start one or more ordinary Codex TUIs independently, before PackWalk, and
complete a turn in each so their supported persisted records are current. From
this repository, start the continuously refreshing view with:

```sh
npm run packwalk
```

That command builds the package binary, starts or connects to the PackWalk
daemon automatically, and opens the plain CLI view. Do not start a separate
daemon. The view shows project, exact Codex session identity, supported
activity, evidence source, freshness, millisecond source-update time, PackWalk
observation time, and honest state for every supported row. A singleton keeps
the compact six-line layout; an overview groups one row per session under each
field heading. Exact Codex identity remains authoritative even when two rows
share a repository or display label. Note one row's `SESSION` and `SOURCE
UPDATED`, then complete another turn in that same Codex session. After Codex
persists the change and polling observes it, PackWalk keeps every `SESSION`
distinct, shows the changed row as `POLLED`, and renders its later `SOURCE
UPDATED` value without changing the other row's committed evidence. A capable
terminal with enough width refreshes the complete frame. Redirected output, a
dumb terminal, or a terminal too narrow for the table appends each complete
plain-text frame instead. Press Ctrl-C to close the CLI; the daemon and Codex
continue independently.

For one current result suitable for scrollback, screen readers, or scripts,
use either one-shot command:

```sh
npm run --silent packwalk -- text
npm run --silent packwalk -- json
```

`text` emits the same complete fields without terminal cursor controls. `json`
emits the daemon's versioned Effect-Schema event: an available result is a
protocol-v2 `SessionsSnapshot` with a required nonempty `views` collection,
while an unavailable source is a `SessionUnavailable` with a required redacted
`code` and `message`. Committed polling normally emits `SessionsUpdated` with
the complete overview plus exact `changedSessionIds`. If that richer envelope
would exceed the bounded local frame while the equivalent complete overview
fits, the daemon commits and emits `SessionsSnapshot` instead. Consumers must
treat both tags as complete current overviews; only `SessionsUpdated` names the
changed identities. The tagged variants make unavailable session fields
distinct from data that was merely omitted. Both commands query the daemon,
write one document with the host platform's line ending, and exit. A snapshot
or explicit unavailable result exits successfully; invalid arguments,
connection or daemon failure, an empty stream, encoding failure, or output
failure emits one redacted error to stderr and exits nonzero. Neither command
reads Codex or PackWalk SQLite directly.

Protocol-v2 overview clients use a versioned per-user local endpoint. A
persistent protocol-v1 daemon is neither killed nor mistaken for the current
overview service, and the v2 client never falls back to its singleton result.

A newly discovered view is labelled `discovered`; its first successful reread
and later persisted changes are labelled `polled`. Neither label claims live
attachment or direct control.

The maintainer accepted the corrected Ticket 01 real-session presentation and
reconnect recovery after one continuously running CLI kept the same exact
session and redrew a later committed source timestamp in place. Ticket 04 now
implements the multi-session shape and is awaiting its independent review
gates. The view still has non-blocking visual-hierarchy feedback for a separate
readability slice. See [current state](docs/current-state.md), [Ticket
01](.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md),
and [Ticket
04](.scratch/packwalk-post-launch-orientation/issues/04-keep-overlapping-codex-sessions-distinct.md).

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
- [Text and JSON output ticket](.scratch/packwalk-post-launch-orientation/issues/03-offer-the-same-view-as-plain-text-and-json.md)
- [Multi-session identity ticket](.scratch/packwalk-post-launch-orientation/issues/04-keep-overlapping-codex-sessions-distinct.md)

## Source availability

PackWalk's current source revision is publicly visible. No license has been
selected for this revision, and it does not grant reuse rights.

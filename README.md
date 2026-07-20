# PackWalk

PackWalk is a local, post-launch supervision and intervention product for
ordinary Codex sessions that the user started independently. It provides one
truthful place to understand where attention belongs and is intended to add
safely qualified asking, steering, approval, rejection, and interruption
without owning the lifecycle of the Codex sessions it assists.

## Status

PackWalk's accepted first implementation is a read-only polling slice. It
discovers supported existing Codex sessions, persists a content-free
multi-session overview and structural evidence history, exposes both through
the PackWalk daemon, and displays polling updates in a plain command-line view
without mixing exact identities. It does not yet establish trustworthy live
attachment or perform a consequential action.

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
activity, evidence source, freshness, provenance, millisecond source-update
time, PackWalk observation time, and honest state for every supported row. A
singleton keeps the compact six-line layout; an overview groups one row per
session under each field heading. Exact Codex identity remains authoritative
even when two rows share a repository or display label. Note one row's `SESSION` and `SOURCE
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
protocol-v4 `SessionsSnapshot` containing protocol-v2 views in a required
nonempty `views` collection,
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

Inspect the committed structural history for one exact session with:

```sh
npm run --silent packwalk -- inspect <exact-session-id> text
npm run --silent packwalk -- inspect <exact-session-id> json
```

Inspection queries the daemon rather than refreshing Codex or reading PackWalk
SQLite from the client. It returns the current explained view plus facts in
PackWalk commit order, with source-update, observation, and recording times kept
distinct. Coverage states whether evidence predates durable history, while
fixed omitted-content and unsupported-fact fields make clear that prompts,
responses, tool or command output, diffs, terminal input, raw provider payloads,
live observation, and attention inference are not present. The daemon serves
bounded pages pinned to one commit ceiling; the CLI assembles them into one
deterministic text or JSON document. An unknown exact identity returns an
explicit tagged unavailable result. Exact session identity is case-sensitive,
and `projectIdentity` is the only retained path metadata.

Protocol-v4 overview and history clients use a versioned per-user local
endpoint and never fall back to older events. The authoritative database
remains `packwalk-v2.sqlite`; its checked storage-v4 migration preserves
protocol-v2 current rows, backfills truthful history coverage, and takes an
SQLite-aware pre-migration backup. A persistent protocol-v3 daemon must release
that shared database before the v4 daemon can migrate it.
PackWalk fails closed rather than killing the old daemon or opening a second
writer; generic upgrade recovery remains Ticket 08 work. A persistent
protocol-v1 daemon uses its separate legacy database and is neither killed nor
mistaken for the current overview service.
The client transport is not the database-writer lock: the daemon first retains
exclusive locking mode on its one scoped PackWalk SQLite connection, then
claims the Unix socket or Windows named pipe. Those endpoints are transport
only: replacing the Unix `/tmp` transport directory can make the service
unavailable, but a competing daemon still fails storage acquisition before it
can publish or write. Once this process wins storage election, any endpoint
bind failure is reported as transport unavailable; an unrelated accepting
listener is not evidence that a healthy PackWalk daemon is already running.

PackWalk opens its authoritative database only after qualifying the physical
storage directory as APFS on macOS or one of an explicit set of direct local
filesystems on Linux. Remote, unknown, stacked, or failed POSIX filesystem
probes fail before SQLite opens. An existing database object and its physical
parent must both qualify and report the same positive native storage device;
the same rule applies to a final symlink's resolved target. The pinned Node
runtime cannot positively distinguish a mapped Windows drive from a local
drive, so release storage fails closed on Windows even for an ordinary drive
spelling. Deterministic Windows path and named-pipe contracts remain covered;
Ticket 10 must add native volume qualification before Windows can open
authoritative storage.

A newly discovered view is labelled `discovered`; its first successful reread
and later persisted changes are labelled `polled`. Neither label claims live
attachment or direct control.

If an exact persisted source temporarily disappears, PackWalk keeps the last
committed structural metadata, marks it `stale`, and shows `RETAINED
(source-unavailable)` provenance. Rejected or regressed exact evidence is
retained as `source-unsupported` without merging the rejected payload. A later
valid read becomes one new `fresh`/`OBSERVED` commit even when the underlying
source timestamp is unchanged. If overview discovery itself becomes
unsupported while known rows remain, those rows become visibly retained and
unsupported instead of appearing normally fresh or disappearing. Repeated
loss, recovery, restart, and reconnect do not invent additional commits.
Polling remains delayed persisted observation, not live or real-time
attachment.

The maintainer accepted the corrected Ticket 01 real-session presentation and
reconnect recovery after one continuously running CLI kept the same exact
session and redrew a later committed source timestamp in place. Ticket 04's
multi-session shape is resolved and integrated. Ticket 05's durable restoration
and retained-evidence implementation is resolved with a clean final generic
review and a `READY FOR MAINTAINER` independent product preflight. Ticket 06's
content-free history implementation is complete and remains claimed for its
fresh generic review and independent product preflight. The view still has
non-blocking visual-hierarchy feedback for a separate readability slice. See
[current state](docs/current-state.md), [Ticket
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
- [Restoration and degradation ticket](.scratch/packwalk-post-launch-orientation/issues/05-restore-and-degrade-the-overview-safely.md)
- [Content-free evidence-history ticket](.scratch/packwalk-post-launch-orientation/issues/06-inspect-content-free-evidence-history.md)

## Source availability

PackWalk's current source revision is publicly visible. No license has been
selected for this revision, and it does not grant reuse rights.

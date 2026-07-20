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

At the Ticket 01 acceptance point, the branch refreshed the existing
one-session discovery when a CLI subscribed, replaced only that singleton when
supported discovery identified a different session, and preserved monotonic
PackWalk commit order. That accepted slice did not enumerate, display, or poll
multiple sessions concurrently. The compact
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
`integration/full-local-product` has advanced through resolved Ticket 03 at
`31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8`.

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
is resolved and integrated from `agent/ticket-03-text-json-output`. Its fixed
integration point was `6c4686dca30466b52db56785ef159348a28a4d1e`.
`packwalk text` and `packwalk json` consume exactly the same initial public
daemon event as the refreshing CLI, emit one
platform-native-line-ended document, and exit without affecting the daemon.
JSON uses the existing strict, versioned `SessionEvent` schema and preserves an
explicit tagged unavailable result rather than optional session fields. Direct
Codex or SQLite reads remain outside the client boundary. Final deterministic
verification passes 19 files and 77 tests plus typecheck, lint, and build. The
exact documented quiet commands passed against the public daemon on macOS
arm64, and independent product preflight reports `READY FOR MAINTAINER`.

The paragraphs below are chronological delivery history. Any statement that a
gate “remains” or is “pending” records the state at that numbered pass, not the
current Ticket 03 result.

Generic review pass 1 found no Ticket 03 Specification issue and required two
Standards corrections: CLI argv now passes through a strict Effect Schema, and
one `OneShot { format }` command owns the shared text/JSON execution path. Those
corrections are implemented. Fresh generic review pass 2 is clean with zero
Standards and zero Specification findings. Independent product preflight is the
remaining delivery gate; no maintainer acceptance is claimed.
The first preflight reported `NOT READY` solely because npm lifecycle banners
polluted stdout for the README's repository commands. The documented one-shot
commands now use `npm run --silent packwalk -- ...`, and an isolated
process-level regression executes those exact commands through real local IPC
to protect clean text, parseable JSON, and invalid-usage streams. The blocker is
fixed pending full verification, fresh generic review, and fresh preflight.
Generic review pass 3 confirmed zero Specification findings and required a
truthful generic catch-all error plus bounded process-tree cleanup in the new
regression. Both corrections are implemented with platform-specific termination
and explicit command/test timeouts, pending full verification and fresh review.
Generic review pass 4 found the initial cleanup was not itself awaited and
bounded. The replacement runner now checks and awaits POSIX process-group or
Windows process-tree termination, preserves failed cleanups for final retry,
and has a passing disposable nested-process timeout regression. Full
verification is green at 17 files and 76 tests; another fresh review remains
required.
Generic review pass 5 required Windows timeout cleanup to verify the process
tree even if its owner exits and required losing deadline timers to be cleared.
The shared deadline helper now clears every timer, and Windows cleanup always
checks `/T`, escalates to `/F`, and fails visibly without proof. Full
verification and another fresh review remain required.
Generic review pass 6 remained clean on Ticket 03 Specification and found that
the cleanup regression did not independently observe its disposable descendant
and that process supervision overburdened the product-output test. The bounded
runner is now a cohesive test support module, while a dedicated regression
captures the fixture descendant identity and proves that process is gone after
cleanup. Focused process tests are green, and full verification passes 18 files
and 76 tests plus typecheck, lint, and build. Another fresh independent review
remains required.
Generic review pass 7 is clean on Standards and found that the cross-platform
regression selected `npm.cmd` on Windows but attempted to spawn that command
shim without a shell, preventing the Windows contract from being exercised.
The regression now executes npm's JavaScript entry point with the current Node
executable and argument array, retaining the exact quiet npm-script semantics
without shell quoting. A pure Windows-path invocation regression first failed
against the old direct-shim plan. Three focused tests are green; full
verification passes 19 files and 77 tests plus typecheck, lint, and build.
Another fresh independent review remains required.
Fresh generic review pass 8 is clean with zero actionable Standards findings
and zero Ticket 03 Specification findings across the complete branch through
`3553d49d97f7428a4928e8102693da81e5a1f2fc`. Independent product preflight was
then the remaining Ticket 03 delivery gate; no maintainer acceptance was
claimed by that review.
Independent product preflight at
`6493aa8a6bc8ce250b52c8509f366cff9a4d9612` reports `READY FOR MAINTAINER`.
The exact quiet text and JSON commands passed against the public daemon with
matching session evidence; invalid usage had deterministic empty stdout, exact
native-line-ended stderr, and exit 1. Six focused files and 21 tests passed;
full verification passed 19 files and 77 tests plus typecheck, lint, and build.
Real product execution was on macOS arm64. Windows and Linux currently have
deterministic contract evidence, including CRLF and Windows paths with spaces;
their real CI process evidence belongs to Ticket 10. Ticket 03's agent-owned
delivery reached resolution without claiming personal maintainer acceptance.
Final generic review pass 9 remained clean on Standards but found the opening
handoff mixed intermediate and final evidence without labelling the former as
history. The opening now states the final evidence and this chronology is
explicitly historical. Ticket 03 remains reclaimed until full verification and
a fresh independent review confirm that documentation repair. Full verification
again passes 19 files and 77 tests plus typecheck, lint, and build; only the
fresh review remains.
Fresh generic review pass 10 is clean with zero actionable Standards and zero
Ticket 03 Specification findings through
`3992844c15bc0838381991ab55278f0166662059`. Fresh independent product
preflight on that exact commit again reports `READY FOR MAINTAINER` after
reproducing the public quiet commands. Ticket 03 is resolved and integrated at
`31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8`.
Real product execution remains macOS arm64 only; deterministic Windows and
Linux evidence is reserved for Ticket 10. No personal maintainer acceptance is
claimed.

[Ticket 04](../.scratch/packwalk-post-launch-orientation/issues/04-keep-overlapping-codex-sessions-distinct.md)
is implemented on `agent/ticket-04-overlapping-sessions` from fixed integration
point `31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8` and remains claimed while its
review gates run. The daemon now publishes protocol-v2 complete overviews with
exact `changedSessionIds`; the CLI presents every supported session distinctly,
including two exact IDs in one repository with the same display label. Polling
commits use one daemon-owned global allocator and upsert only changed exact-ID
rows, so an update to one session leaves every other projection byte-for-byte
unchanged. Duplicate exact source IDs fail visibly as a redacted
`source-ambiguous` result before project resolution or arbitrary selection.

The expanded SQLite schema migrates the v1 singleton transactionally after a
SQLite-aware backup, validates legacy rows with Effect Schema before migration,
and records the checked migration while preserving the global commit sequence.
Project comparison has injected Windows case/separator normalization and
case-sensitive macOS/Linux behavior; session identity remains exact on every
platform. Deterministic acceptance crosses a two-session Codex SQLite fixture
through the real daemon and local IPC seam into the CLI formatter. Full
verification passes 21 files and 83 tests plus typecheck, lint, and build. The
suite caps Vitest at four workers after default machine-wide file fan-out
repeatedly caused `EPERM` in the existing detached process-tree cleanup; two
consecutive complete test runs and the final verification run are green.

The first compiled-product check against the machine's persistent protocol-v1
daemon exposed an upgrade blocker: the old daemon accepted its unversioned
endpoint and rejected the v2 subscription. The repair gives incompatible local
session protocols distinct endpoints (`daemon-v2.sock` on Unix and a
`packwalk-v2-*` named pipe on Windows), avoiding both an unsafe daemon kill and
a false singleton fallback. A compiled macOS arm64 exercise left a legacy
endpoint accepting while the v2 daemon and text/JSON clients used only the new
endpoint. Two same-project exact IDs appeared, one source update advanced only
its own view, the other view remained serialized-identical, all commands exited
zero with empty stderr, and the legacy endpoint received no connections. The
isolated exercise cleaned up its processes and data. Fresh generic code review
and independent product preflight are again the only remaining gates.
Restoration, history, deletion, live attachment, intervention, and routing
remain outside Ticket 04, and no maintainer acceptance is claimed.

## Reproduce

Use the exact versions pinned by the repository:

```sh
npm ci
npm run packwalk
```

Start two ordinary Codex TUIs and complete one turn in each before
`npm run packwalk`; using the same repository gives the strongest identity
check. Confirm that both exact `SESSION` values appear distinctly, then note
both `SOURCE UPDATED` values. Complete another turn in only one session. After
Codex persists the activity and polling observes it, PackWalk must keep both
exact identities, show a later source timestamp only for the changed row, and
leave the other row's evidence unchanged. A capable terminal with enough width
refreshes the complete frame; narrow, non-TTY, or cursor-disabled output
appends another complete plain-text frame. Neither path is live or real-time
observation.

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
2. Finish Ticket 04's generic review and product preflight, then continue
   Tickets 05–10 in dependency order, including a separate readability slice.

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
7. Ticket 04's implementation keeps multiple persisted sessions distinct by
   exact Codex identity and is awaiting independent review before resolution.

An answer that defines PackWalk as a permanently read-only viewer, revives a
wrapper or relay, grants the routing model action authority, or treats remote
architecture as current scope has failed the handoff.

Update this file whenever implementation status, the active ticket, or a known
acceptance blocker changes.

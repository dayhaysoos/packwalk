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
`integration/full-local-product` has advanced through resolved Ticket 05 at
`0816410ea854b3a829ac49ee62826b58cc4174c4`.

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
is resolved on `agent/ticket-04-overlapping-sessions` from fixed integration
point `31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8` and is ready to fast-forward
into `integration/full-local-product`. No personal maintainer acceptance is
claimed.

### Current Ticket 04 contract and evidence

The daemon publishes protocol-v2 complete overviews. A
committed poll normally uses `SessionsUpdated` with exact `changedSessionIds`;
when only that richer envelope exceeds the bounded frame, the equivalent
complete `SessionsSnapshot` is the committed fallback. Both tags are complete
current overviews, while only the update names changed identities. The CLI
presents every supported session distinctly, including two exact IDs in one
repository with the same display label. Polling commits use one daemon-owned
global allocator and upsert only changed exact-ID rows, so an update to one
session leaves every other projection byte-for-byte unchanged. Duplicate exact
source IDs fail visibly as a redacted `source-ambiguous` result before project
resolution or arbitrary selection.

The one scoped authoritative SQLite connection owns writer election before
legacy import, transport, workers, or publication. It snapshots and validates
legacy state, then transactionally imports into the already-open locked current
database; no database pathname is promoted over the owned inode. Before SQLite
opens, the physical storage directory must qualify as APFS on macOS or a known
direct local filesystem on Linux. Remote, unknown, failed, and stacked POSIX
filesystem probes fail closed. Because the pinned Node runtime cannot
positively distinguish a mapped Windows drive, authoritative storage fails
closed on Windows before directory or SQLite creation; Ticket 10 must add
native volume qualification before Windows storage is supported. Deterministic
Windows path, identity, and named-pipe contracts remain covered. Project
comparison has injected Windows case/separator normalization and
case-sensitive macOS/Linux behavior; exact Codex identity remains authoritative
on every platform.

After storage election, any endpoint bind failure is transport unavailable; an
accepting listener is not treated as evidence of a healthy daemon. The repaired
candidate crosses a two-session Codex SQLite fixture through the real daemon
and local IPC seam into the CLI formatter. `npm run verify` passes 22 files,
148 tests, and one intentional host-policy branch skip plus typecheck, lint,
and build; the opt-in persisted-Codex check passes in 9.68 seconds. The first
product-preflight verification blocker is repaired with a deterministic
bounded process-group regression. Fresh generic review pass 14 is clean with
zero Standards and zero Specification findings, and fresh independent product
preflight reports `READY FOR MAINTAINER` with no blocker.

### Ticket 04 delivery chronology

The paragraphs below are chronological checkpoints. Pending gates and designs
such as staged-main promotion describe their moment in the delivery history;
they are not the current contract above.

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
pass 1 then found two actionable version-boundary defects: the production v2
seam still accepted/decoded v1 frames, and the two endpoint versions could
leave two daemon writers sharing `packwalk.sqlite` while v2 migrated its
schema. Both blockers and the follow-up storage audit are now repaired.
Production IPC is statically and dynamically protocol-v2-only. V2 owns
`packwalk-v2.sqlite`, and one normalized durable-database identity now maps to
one short endpoint across launch environments. Startup snapshots the active
legacy main/WAL/SHM unit, retains a checked pre-migration copy, migrates a
rollback-journal staging database, and atomically promotes it without taking
the legacy database away from its older writer. Backup completion cannot be
interrupted ahead of resource finalization, handled failures clean staging,
and a retained backup from an interrupted startup can resume safely.

Focused verification passes 37 tests and `npm run verify` passes 21 files and
92 tests plus typecheck, lint, and build. The opt-in real persisted polling
check passed in 8.23 seconds. A compiled exercise against the machine's still-
running protocol-v1 daemon returned 19 unique exact identities through both
text and protocol-v2 JSON with zero exits and empty stderr. After another
ordinary persisted turn boundary, only this task's exact row advanced; the
other 18 serialized view hashes and the identity set remained unchanged. The
test-started v2 daemon was stopped by its verified endpoint-owning PID, while
the pre-existing v1 daemon remained running. Fresh generic review pass 2 was
clean on Specification and found three Standards defects; all three now have
red-first regressions and repairs. Each poll response is bound to its requested
exact identity, with crossed evidence surfaced as redacted
`source-incompatible` and no stored mutation. Production endpoint authority
resolves durable database aliases to physical identity, including the nearest
existing ancestor before the database exists. Unix endpoint setup opens the
leaf without following links, verifies that it is a directory owned by the
current user, and applies mode `0700` through the verified descriptor; the
PackWalk data directory remains private too. Focused verification passes 25
tests, `npm run verify` passes 21 files and 96 tests plus typecheck, lint, and
build, and the opt-in persisted-Codex check passes in 8.22 seconds. The compiled
product again returned all 19 unique exact identities through text and
protocol-v2 JSON with zero exits and empty stderr. Ticket 04 remains claimed
after fresh generic review pass 3 reported zero Specification findings and one
P1 Standards blocker. Protocol v2 currently accepts an unbounded overview,
then commits it before IPC applies its 4 MiB frame limit. A strictly decoded
90-row maximum-size snapshot measured 4,444,968 bytes against the 4,194,304-byte
limit, proving that legitimate persisted evidence can become durably
unpublishable. That blocker now has red-first startup, update, and protocol
regressions plus one exported Effect JSON codec that enforces the exact 4 MiB
UTF-8 limit on encode and decode. IPC uses the same codec, and the surface
validates each complete event before storage commit. An unpublishable overview
emits redacted protocol-v2 `overview-unavailable`, preserves the last durable
rows and commit sequence, and recovers through a bounded snapshot. Focused
verification passes 26 tests; `npm run verify` passes 21 files and 99 tests plus
typecheck, lint, and build; and the opt-in persisted-Codex check passes in 8.18
seconds. A supplemental Effect/IPC audit reports zero actionable findings.
Fresh generic review pass 4 is clean on Specification and reports one P1
Standards blocker: an 84-row maximum-field snapshot fits at 4,147,464 bytes,
but its mandatory first polling update reaches 6,209,601 bytes because all 84
identities changed from `Discovered` to `Polled`. Rejection preserves storage
yet can repeat forever without unrelated source mutation. That blocker now has
a red boundary regression and an ordered candidate fix: normal changes validate
`SessionsUpdated` first, then use the equivalent bounded `SessionsSnapshot` if
only its changed-identity envelope is too large. Neither fitting still produces
`overview-unavailable` without commit, and unavailable recovery stays
snapshot-based. The 84-row proof commits every row once as `Polled` at
sequences 85–168, leaves sequence 168 unchanged on the next poll, and
reconnects to the committed polled snapshot. Focused verification passes 13
tests; `npm run verify` passes 21 files and 100 tests plus typecheck, lint, and
build; and the opt-in persisted-Codex check passes in 8.20 seconds. A
supplemental fallback audit reports zero actionable findings. Ticket 04 remains
claimed after fresh generic review pass 5 reported two actionable findings.
First, native macOS firmlink spellings for the same database device/inode can
still hash to different IPC endpoints and split sole-writer daemon authority.
Second, the README and opening current-state contract imply every committed
poll is `SessionsUpdated`, omitting the intentional bounded
`SessionsSnapshot` fallback. That P2 gap is now repaired: both public contracts
name the two valid complete-overview variants and reserve
`changedSessionIds` for `SessionsUpdated`. The native-alias P1 is now repaired,
including two follow-up defects found by its final targeted audit: revalidation
uses a separate capture-only path that
does not recreate or chmod a missing directory, and existing final database
symlinks require a current-user-owned mode-0700 target parent. Shared and
dangling targets fail without mutation; Windows final-file symlinks fail closed
pending Ticket 10 qualification. Authority is revalidated after prep, after
endpoint claim before either `AlreadyRunning` or migration, and after
session/storage acquisition. Both real macOS spellings now derive
`/tmp/packwalk-v2-35ce8d997aaefb5435f8bb4f/daemon-v2.sock`. Focused checks pass
25 tests; `npm run verify` passes 21 files and 108 tests plus typecheck, lint,
and build; and the persisted-Codex check passes in 4.12 seconds. Compiled JSON
and text each returned all 19 unique exact identities with zero exits and empty
stderr. The endpoint-owning v2 PID 27668 was stopped and the pre-existing v1
  PID 77857 remains untouched. Final targeted authority review reports zero
actionable findings. Fresh generic review pass 6 then reports zero actionable
Specification findings and one P1 Standards blocker in the actual launcher
order: after the captured data directory is replaced with a symlink,
`prepareRuntimeDirectories` follows it and chmods the unrelated target before
authority verification fails. That P1 is now repaired with the exact red
launcher-sequence regression. Runtime-path resolution exclusively creates,
secures, and captures the database directory; later preparation owns only the
independent Unix endpoint directory. A swapped data-directory symlink and its
unrelated mode-0755 target remain unchanged before capture-only verification
rejects the launch. Focused runtime/build verification passes 24 tests;
`npm run verify` passes 21 files and 109 tests plus typecheck, lint, and build;
and the persisted-Codex check passes in 4.13 seconds. Rebuilt public JSON and
text clients each exited zero with empty stderr and returned all 19 unique exact
identities; JSON was a protocol-v2 `SessionsSnapshot`. The positively
identified endpoint-owning v2 PID 32103 was stopped, while pre-existing v1 PID
77857 remains running and untouched. Fresh generic review pass 7 reports zero
actionable Specification findings and one P1 Standards blocker: two private
directories can hard-link one existing `packwalk-v2.sqlite` inode while
deriving different daemon endpoints and adjacent WAL/SHM paths. Ticket 04
repairs that P1 with a native-filesystem regression that first proves the
split. Existing direct database entries and qualified final-symlink targets
must now be regular files with native link count exactly one, and capture-only
revalidation enforces the same rule. Missing databases still anchor to the
private parent directory, while atomic replacement keeps endpoint authority
stable. Focused runtime/build verification passes 25 tests. Ticket 04 remains
claimed after `npm run verify` passes 21 files and 110 tests plus typecheck,
lint, and build, and the persisted-Codex check passes in 4.13 seconds. Rebuilt
JSON and text clients each exited zero with empty stderr and returned all 19
unique exact identities; JSON was a protocol-v2 `SessionsSnapshot`. The
positively identified v2 endpoint owner PID 98474 was stopped, while
pre-existing v1 PID 77857 remains running and untouched. An entirely fresh
generic review pass 8 reports zero actionable Specification findings and one
P1 Standards blocker in daemon election. A live Unix endpoint directory under
`/tmp` can be renamed, recreated at its original pathname, and rebound while
the first server remains active, returning two `Owned` transport claims for one
durable database authority. Ticket 04 remains claimed while a red real-socket
regression adds a daemon-lifetime writer-authority lock outside the replaceable
transport namespace, acquired before storage and retained for the daemon
scope. That P1 is now repaired: runtime paths derive a hidden Unix socket in
the qualified database directory or a distinct identity-keyed Windows named
pipe; the daemon claims and drains it before transport election or storage and
retains it through its Effect scope. The real-socket regression still proves a
second `/tmp` transport bind after directory replacement, while the composed
daemon claim returns `AlreadyRunning` under the retained authority listener.
Focused runtime, ownership, build, and type checks pass 28 tests, but the
strongest compiled public-path check found the first lock basename reaches 105
bytes in the real macOS PackWalk directory, beyond the native Unix-socket path
limit. JSON and text fail safely with one redacted error and leave neither
socket behind. Ticket 04 remains claimed while a deterministic ordinary-macOS
regression shortens the hidden identity-keyed basename within the portable
bound and an explicit overlong-path contract fails before bind. That blocker is
now repaired red-first: the unchanged identity token uses compact hidden Unix
basename `.pw-v2-<24 hex>`, making the real path 87 bytes against the
conservative 103-byte portable bound. Runtime derivation rejects a longer
authority path before bind through the existing redacted startup failure. The
targeted lock audit then found that `/System/Volumes/Data/Users/...` still
reached about 107 bytes and regressed the required real macOS firmlink seam
even though `/Users/...` fit. The existing native-alias regression is red. The
lock now preserves the same full 96 authority bits as 16 base64url characters
rather than 24 hexadecimal characters. The final hidden basename is
`.pw-<16 base64url>`, bringing the installed `/Users/...` and
`/System/Volumes/Data/Users/...` paths to 76 and 96 bytes. A short real
firmlink fixture preserves lexically different paths, binds and drains the
physical listener, and proves the alias claim is `AlreadyRunning`; the explicit
overlong-path failure remains. Focused runtime, ownership, build, type, lint,
and diff checks pass 30 tests, and the final targeted lock audit reports zero
actionable findings. `npm run verify` passes 21 files and 113 tests plus
typecheck, lint, and build, and the persisted-Codex check passes in 4.11
seconds. Rebuilt JSON and text clients each exited zero with empty stderr and
returned all 19 exact identities; JSON was a protocol-v2 `SessionsSnapshot`.
Positively identified PID 35013 owned both the durable
`.pw-Nc6NmXqu-1Q1-LtP` writer socket and v2 `/tmp` transport, then was stopped
and released both. Pre-existing v1 PID 77857 remains running and untouched.
Ticket 04 remains claimed for a wholly fresh generic review; product preflight
remains paused after pass 9 reports zero actionable Specification findings and
one P1 Standards blocker at the v1/v2 storage boundary. A qualified final
symlink from `packwalk-v2.sqlite` to `packwalk.sqlite` makes import preparation
return early, after which v2 storage migrates the legacy database in place
while its older writer may remain active. A red regression now holds the
legacy writer open while the storage adapter is changed to reject physically
identical legacy and versioned paths before the early return or any database
open. That P1 is now repaired red-first: import preparation follows both
existing paths and rejects matching native device/inode identity as the
redacted storage-open error. The regression keeps the legacy connection open,
proves startup fails, and confirms its only table remains `current_session`;
the complete storage file passes 13 tests. `npm run verify` passes 21 files and
114 tests plus typecheck, lint, and build, and the persisted-Codex check passes
in 4.12 seconds. Rebuilt JSON and text each exited zero with empty stderr and
returned all 19 exact identities; JSON was a protocol-v2 `SessionsSnapshot`.
Positively identified PID 90906 owned both v2 writer and transport sockets and
was stopped cleanly; pre-existing v1 PID 77857 remains running and untouched.
Ticket 04 remains claimed for a wholly fresh generic review; product preflight
remains paused after pass 10 reports zero actionable Specification findings and
one P1 Standards blocker in writer ownership. A live filesystem socket can be
unlinked without closing its listener; removing both authority and transport
entries allows a second composed claim to return `Owned` while the first stays
active. That P1 is now repaired red-first. Runtime paths derive a dedicated
identity-keyed SQLite lock file beside the qualified v2 database on every
supported platform. Before transport or storage, the daemon retains a scoped
`BEGIN EXCLUSIVE` connection; a busy lock exits as `AlreadyRunning`, while
ordinary Unix socket removal or directory replacement can only create another
transport listener. Direct regressions prove one owner under contention,
release on scope close, physical macOS firmlink convergence, and fail-closed
symlink and hard-link entries. Typecheck and 33 focused authority, endpoint,
and runtime-path tests pass. Full verification and wholly fresh generic review
remain required; product preflight remains paused.
A targeted follow-up audit rejects that first SQLite-lock repair before
checkpoint. On Unix, unlinking the lock database preserves the first
connection's inode lock but lets a second claim create a new file at the same
pathname and also return `Owned`. The separate `node:sqlite` authority module
also contradicts ADR 0007's accepted single storage adapter and connection
owner. Ticket 04 remains claimed while the exact pathname-removal case drives a
retained kernel authority with no filesystem election pathname and no second
SQLite connection. The earlier 33-test result is not an acceptance verdict.
Full verification and fresh review remain required; product preflight remains
paused.
The follow-up authority blocker is now repaired at the domain-store seam
without reopening the specification's no-TCP rule. The one scoped
authoritative `DatabaseSync` enters verified exclusive locking mode and forces
acquisition before first-start import, transport, workers, or publication.
Legacy state is snapshotted and transactionally copied into that already-open
current database; the unsafe staged-main rename path is removed. Exact
regressions prove one winner during two concurrent missing-v2 starts,
continued commits after a loser fails, clean ownership transfer after scope
close, native macOS alias convergence, and storage refusal after the Unix
transport directory or live socket is replaced. Typecheck and 44 focused
storage, transport, and runtime-path tests pass. Deliberate same-user deletion
or replacement of PackWalk's authoritative database file is not claimed as a
security boundary. Full verification and wholly fresh generic review remain
required; product preflight remains paused.
Post-repair qualification is green. `npm run verify` passes 22 files and 117
tests plus typecheck, lint, and build; a static architecture law keeps
`node:sqlite` inside the approved source adapter, and the opt-in persisted-Codex
check passes in 8.23 seconds. An isolated compiled daemon was the sole open
owner of its v2 database. Independent ordinary and transport-unlinked
contenders both exited 1 with no output while that owner stayed alive; after
its deliberate `SIGKILL`, a successor acquired the same endpoint and reopened
the durable snapshot containing both exact same-project sessions. The installed
JSON and text clients then
returned 19 distinct exact identities, including two in one project, with zero
command errors. Positively identified v2 PID 2155 owned the production v2
database and endpoint and was stopped; pre-existing v1 PID 77857 remains alive
and untouched. Ticket 04 remains claimed only for a wholly fresh generic review
and independent product preflight; no maintainer acceptance is claimed.
Fresh generic review pass 11 reports zero actionable Specification findings
and two independently confirmed Standards blockers. Runtime resolution still
accepts network-backed application-data paths even though exclusive WAL
authority is local-filesystem-only. After storage authority succeeds, an
unrelated accepting listener can also be misclassified as `AlreadyRunning`,
even though a healthy current daemon would have prevented that storage
acquisition. This handoff additionally needs its superseded staged-promotion
chronology marked historical and its durable restart wording distinguished
from Ticket 05's broader restoration/degradation behavior. Ticket 04 remains
claimed while red regressions and documentation repairs address every finding;
full verification and an entirely fresh generic review follow. Product
preflight remains paused.
Pass 11's blockers are repaired red-first. Deterministic laws reject remote,
unknown, and failed POSIX filesystem probes plus direct Windows UNC and device
spellings; locality is revalidated before transport. A foreign accepting
listener after storage election now produces the same redacted
transport-unavailable failure as every other bind error. The current contract
is separated from superseded delivery chronology above. `npm run verify`
passes 22 files and 140 tests plus typecheck, lint, and build, and the opt-in
persisted-Codex check passes in 8.22 seconds. Ticket 04 remains claimed for an
entirely fresh generic review and independent product preflight.
An independent follow-up locality audit found two remaining P1s before that
review could start. A drive-letter spelling can still hide a mapped Windows
share, so release code must fail Windows storage closed until Ticket 10 adds a
positive native volume qualification. Linux eCryptfs and overlayfs can hide
network-backed lower layers and must be removed from the qualified-local
allowlist. Red policy laws now cover both findings; verification and review
remain paused until their green implementation and handoff repair.
Both follow-up P1s are now implemented green. Windows native storage fails
closed until positive native volume qualification exists, while pure Windows
path, identity, and named-pipe laws remain deterministic. eCryptfs and
overlayfs are no longer treated as direct local Linux filesystems. The 53
focused locality and endpoint tests pass; `npm run verify` passes 22 files and
141 tests plus typecheck, lint, and build; and the real persisted-Codex check
passes in 8.21 seconds. On the fresh compiled build, both an ordinary contender
and a contender after transport unlink exited 1 while the sole database owner
remained alive; after deliberate `SIGKILL`, its successor reopened both exact
fixture sessions with zero combined process-output bytes. Installed text and
JSON returned 19 unique exact identities, including two in one project. The
positively identified v2 database/endpoint owner PID 23156 was stopped; v1 PID
77857 remains alive and untouched. Ticket 04 is claimed only for a wholly
fresh generic review and independent product preflight.
Fresh generic review pass 12 reports zero actionable Specification findings
and two P1 Standards/storage blockers. An existing database object can be a
single-file bind mount on unqualified storage even when its parent directory
qualifies, so both the object and parent must qualify and share the same native
storage device.
The intentional Windows fail-closed policy also leaves native success-path
tests guaranteed to fail on Windows and host-coupled on unqualified Linux
temporary filesystems. Red regressions now cover database-object qualification;
native product tests must separate injected path/identity laws, qualified-host
success, and visible unqualified-host failure with no database or endpoint
publication. Ticket 04 remains claimed; verification, fresh generic review,
and product preflight are paused until both blockers are repaired.
Both pass 12 blockers are now implemented. Existing direct database files and
resolved final-symlink targets receive their own filesystem qualification and
must share a positive native storage device with the qualified physical parent;
revalidation applies the same law after a missing database is created. Native
product tests now select either qualified-host text/JSON success or
unqualified-host redacted failure before database or endpoint publication.
Pure injected path, identity, and endpoint laws remain cross-platform, and the
opt-in real-Codex test skips hosts where product storage cannot qualify. Focused
tests, full verification, and an entirely fresh generic review remain pending;
product preflight stays paused.
Post-repair qualification is green. The focused runtime/product suite passes 55
tests with the opposite host-policy branch intentionally skipped. `npm run
verify` passes 22 files, 147 tests, and one intentional host-policy branch skip
plus typecheck, lint, and build; the real persisted-Codex check passes in 8.24
seconds. On the fresh compiled build, ordinary and transport-unlinked
contenders both exited 1, the sole database owner stayed alive, and a successor
after deliberate `SIGKILL` reopened both exact fixture sessions with zero
combined process-output bytes. Installed text and JSON returned 19 unique exact
identities, including two in one project. Positively identified v2
database/endpoint owner PID 70385 was stopped; v1 PID 77857 remains alive and
untouched. Ticket 04 is claimed only for an entirely fresh generic review and
independent product preflight.
Fresh generic review pass 13 is clean across the complete branch from fixed
integration point `31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8` through
`6acb970db0cd42e118c8cec924ea85fa817dba28`: independent Standards and
Specification reviewers report zero actionable findings, and the separate
storage/platform audit reports zero blockers. Ticket 04 remains claimed only
while independent product preflight runs; no maintainer acceptance is claimed.
Independent product preflight on exact head
`4220c91bbeaec8fda653aecf44c22ec6216db3d3` reports `NOT READY` solely because
the required four-worker `npm run verify` command failed twice with `kill
EPERM` in disposable POSIX process-tree cleanup. Every Ticket 04 product
outcome, focused public daemon/IPC/CLI suite, installed text/JSON path, and the
real persisted-Codex check passed; the same cleanup test passes alone and the
complete deterministic suite passes serially. Ticket 04 remains claimed while
that concurrency-sensitive verification blocker is diagnosed and repaired,
then must return through full verification, fresh generic review, and fresh
independent preflight.
The preflight blocker is repaired red-first. POSIX group-signal `EPERM` now
keeps cleanup under bounded exit verification rather than aborting before that
proof; escalation still fails unless the group becomes absent. A real
regression forces the first detached-group signal to return `EPERM` and proves
both fixture owner and descendant disappear with no retained active child.
Focused process tests pass, and `npm run verify` passes 22 files, 148 tests,
and one intentional host-policy skip plus typecheck, lint, and build. Ticket 04
remains claimed for a wholly fresh generic review and fresh independent
product preflight.
Fresh generic review pass 14 is clean across the complete branch from
`31874ccd66c61d1ff49ef38ef77db1f4afcaf5f8` through
`fd376f82e02540c537f30a24be25ab79ea47ab08`: independent Standards and
Specification reviewers report zero actionable findings, and the targeted
process-safety audit reports no blocker. Ticket 04 remains claimed only for a
fresh independent product preflight; no maintainer acceptance is claimed.
Fresh independent product preflight on exact head
`3ce9702fafcfef3e5a4c9009e228b64cc5b9f6dc` reports `READY FOR MAINTAINER`.
The exact verification command and a second four-worker run pass, installed
text and JSON return 19 unique exact identities, the real persisted-Codex path
observes a later polled update in 9.68 seconds, and v1 PID 77857 remains
untouched. Real product execution is macOS arm64; Windows and Linux remain
deterministic contract evidence for Ticket 10. Ticket 04 is resolved without
claiming personal maintainer acceptance; only optional two-TUI presentation
and in-place-redraw judgment remains.
Ticket 05's stale/degraded recovery semantics, evidence history, deletion,
live attachment, intervention, and routing remain outside Ticket 04, and no
maintainer acceptance is claimed.

[Ticket 05](../.scratch/packwalk-post-launch-orientation/issues/05-restore-and-degrade-the-overview-safely.md)
is resolved on `agent/ticket-05-safe-restoration` from fixed integration point
`ef6ed5074b6a039ae7ced76e50508405c82f338e`. The first fresh generic review's
three Standards findings and two Specification findings are fixed. The second
fresh review's three Standards smells and one Specification blocker are also
fixed. The third fresh review's one Standards smell and one Specification
blocker are fixed as well. Full verification is green; a fourth wholly fresh
generic review returned zero actionable Specification findings and one
Standards smell. That duplicated v3 table DDL is now one frozen fragment, with
its pinned migration checksum unchanged. The fifth fresh whole-branch review
returned zero actionable Standards findings and zero actionable Specification
findings. The first independent product preflight then returned `NOT READY`
solely because whole-source loss/recovery and retained one-shot JSON lacked one
public-seam proof. That deterministic evidence blocker is fixed. The final
post-fix generic review returned zero actionable Standards findings and zero
actionable Specification findings, and a new independent product preflight
returned `READY FOR MAINTAINER`. No agent-verifiable or required human-evidence
blocker remains; this does not claim the maintainer's personal acceptance.

`SessionView` v2 now makes freshness and provenance an explicit closed pair:
accepted evidence is `fresh`/`Observed`, while last-supported metadata is
`stale`/`Retained` with reason `source-unavailable` or `source-unsupported`.
Exact polling failures, crossed identities, ambiguous evidence, and regressed
source time never merge rejected payloads or drop a known row. A failed
overview discovery with known rows visibly retains those rows as
`source-unsupported` rather than masking the failure behind exact polling.
Regressed exact evidence discovered during daemon startup likewise commits and
renders the last supported row as retained across reconnect rather than
collapsing the overview to an unavailable placeholder.
When an otherwise successful exhaustive discovery omits one restored exact
identity, that row commits once as retained `source-unavailable` metadata; the
other discovered rows remain independently observed.
Degradation preserves project, activity, evidence source, lifecycle state,
source time, and the last successful observation time; it commits once. The
same valid source fact recovers as one new observed commit even when its source
timestamp did not change, and repeated loss or recovery is a no-op.

The public command/event contract is strict protocol v3 on a distinct v3 local
endpoint; every current view is protocol v2. SQLite remains authoritative in
`packwalk-v2.sqlite`. Storage migration 3 preserves the immutable v2 checksum,
accepts only exact known migration prefixes, validates v2 rows and allocator,
takes an SQLite-aware `.pre-migration-v3.sqlite` backup before upgrading an
existing v2 overview, and converts prior views to fresh observed provenance
without changing their timestamps or commit sequences. A persistent
protocol-v2 daemon can retain the shared writer and
must exit before v3 can migrate; the new daemon fails closed and never kills it
or opens a second database writer. A general upgrade recovery workflow remains
Ticket 08 scope.

The strongest deterministic lifecycle proof crosses a first daemon, SQLite,
daemon shutdown, a second fresh daemon scope, real local IPC, the production
CLI renderer, exact source loss, same-fact recovery, and reconnect. It restores
commit N and its observation metadata byte-for-byte, commits retained loss as
N+1, commits recovery as N+2, renders the corresponding visible CLI frames, and
reconnects to one current snapshot without replay. A
two-session public test proves only the unavailable exact identity changes.
Injected Windows, macOS, and Linux application-data/endpoint laws remain
explicit; real transport execution is host-native and native three-platform
qualification remains Ticket 10. The deterministic suite passes 22 files, 157
tests, and one intentional host-policy skip; typecheck, lint, build, and diff
checks pass. The opt-in installed-Codex test passes against this machine's real
persisted source without starting, resuming, or changing a Codex session.
The focused nine-file public lifecycle/storage/IPC/CLI suite passes 129 tests,
including two-session whole-source loss, repeated loss, same-fact recovery,
reconnect without replay, and actual retained/recovered one-shot JSON.
Disposable compiled text/JSON and real local IPC product paths were clean. The
pre-existing protocol-v1 daemon PID 77857 remained alive and untouched.
Evidence history, deletion, generic migration/backup recovery,
contention handling, native three-platform qualification, live attachment,
intervention, and routing remain outside Ticket 05.

[Ticket 06](../.scratch/packwalk-post-launch-orientation/issues/06-inspect-content-free-evidence-history.md)
is claimed on `agent/ticket-06-content-free-history` from fixed integration
point `0816410ea854b3a829ac49ee62826b58cc4174c4`. Implementation is complete
while the ticket remains claimed for fresh generic review and independent
product preflight.

Protocol v4 adds an exact-session, read-only history query through the daemon,
IPC, and `packwalk inspect <exact-session-id> [text|json]`. The client follows
fixed 32-fact pages pinned to one `throughCommitSequence`; inspection neither
refreshes the Codex source nor reads PackWalk SQLite directly. Each result
explains the current projection from causal PackWalk commit order and states
history coverage, omitted content, and unsupported facts explicitly. Strict
Effect schemas reject prompts, responses, tool and command output, diffs,
terminal input, raw Codex payloads, raw IPC bodies, and excess nested fields.

Storage migration 4 adds an immutable scalar history table and a SQLite-aware
`.pre-migration-v4.sqlite` backup. Prior projections become truthful
`MigratedBaseline` facts without invented recording times or commits. New
nonempty batches atomically advance the global allocator, update current rows,
and append `Committed` facts. `recordedAtMs` remains distinct from source and
observation clocks; exact identity uses binary equality; causal order never
depends on wall-clock order. Deterministic tests cover migration and import,
rollback, concurrent pagination, restart, source loss and recovery, read-only
repeat inspection, prohibited content, and injected Windows/macOS/Linux
encoding and path behavior. Compiled text and JSON inspection crossed real
local IPC, and the opt-in installed-Codex check crossed a real persisted update
through storage, publication, IPC, and public history inspection without
changing Codex. `npm run verify` passes 26 files, 174 tests, and one intentional
host-policy skip plus typecheck, lint, and the production build.

A cold real-product run also exposed that the former five-second reconnect
budget could expire while a newly started v4 daemon completed first migration
and discovery. Overview and inspection clients now have a bounded thirty-second
startup budget. A fresh v4 daemon subsequently served the real overview and
rendered an exact-session history, including explicit
`prior-history-unavailable` coverage for migrated evidence. Only the
PackWalk-owned v4 test daemon was restarted; the pre-existing protocol-v1
daemon PID 77857 remained alive and untouched. Deletion, generic migration
recovery, contention, native platform qualification, live attachment,
intervention, routing, and searchable transcript history remain outside Ticket
06.

Fresh generic review pass 1 reported four Standards findings and one
Specification finding. Two crossed-session IPC regressions first failed when
an unavailable response named a different exact identity, both on the initial
request and after a valid first page. Every history response is now bound to
the requested exact identity before its tag is handled. One domain-owned view
equality function now protects schema, storage, and multipage IPC consistency;
one shared terminal-text module owns security-sensitive escaping and timestamp
rendering; README separates the accepted tracer bullet from the pending history
extension; and the active integration SHA above now names resolved Ticket 05.
All five findings are corrected. The focused four-file suite passes 21 tests,
and full verification passes 26 files, 172 tests, and one intentional skip plus
typecheck, lint, and build. A wholly fresh generic review remains.

Fresh generic review pass 2 reports zero Specification findings and one
Standards truthfulness gap: retry spacing alone did not bound total elapsed
startup because each IPC attempt has its own open timeout. A red virtual-clock
regression proved the command could remain pending at the claimed deadline.
`connectOrStart` now places the initial attempt, daemon start, retry delays, and
connection attempts under one explicit elapsed deadline; overview and history
commands both supply thirty seconds. The focused deadline suite passes three
tests, and full verification passes 26 files, 173 tests, and one intentional
skip plus typecheck, lint, and build. Another wholly fresh generic review
remains.

Fresh generic review pass 3 reports zero Specification findings and one
Standards blocker: an accepting endpoint could complete overview connection
readiness before returning its first validated event, ending the startup
deadline too early. An accepting-but-silent real-socket regression first failed
against that behavior. Overview readiness now requires the first decoded
protocol-v4 event, preserves it in the downstream queue, and fails if the peer
closes before readiness; only subsequent refreshing remains outside the
startup deadline. The focused four-file IPC/startup/client suite passes 25
tests, and full verification passes 26 files, 174 tests, and one intentional
skip plus typecheck, lint, and build. Another wholly fresh generic review
remains.

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
2. Complete Ticket 06's fresh review and preflight loops, then continue Tickets
   08, 09, 07, the separate readability slice, and Ticket 10 in delivery order.

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
7. Tickets 04 and 05 are resolved and integrated: exact identities remain
   distinct and restoration or degradation is explicit. Ticket 06 now owns
   content-free evidence history and exact-session inspection.

An answer that defines PackWalk as a permanently read-only viewer, revives a
wrapper or relay, grants the routing model action authority, or treats remote
architecture as current scope has failed the handoff.

Update this file whenever implementation status, the active ticket, or a known
acceptance blocker changes.

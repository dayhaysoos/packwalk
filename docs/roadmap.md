# PackWalk roadmap

This roadmap records product direction and ordering. It is not a release-date
promise, and a later phase does not expand the scope of an earlier ticket.

## Guiding sequence

PackWalk earns the right to intervene by first establishing truthful identity,
observation, persistence, and failure behavior. Natural-language and remote
surfaces sit on top of deterministic PackWalk operations; they never substitute
for them.

## Phase 1: One truthful polled session

[Ticket 01](../.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)
delivers one independently discovered session through the daemon and plain CLI.
The implementation exists, but the visible real-session polling refresh has
been reopened for maintainer acceptance.

This phase is read-only. That limitation belongs to the phase, not PackWalk's
long-term product definition.

## Phase 2: One bounded live-event experiment

[Ticket 02](../.scratch/packwalk-post-launch-orientation/issues/02-attempt-one-post-launch-live-codex-event.md)
tests one trustworthy post-launch event against the exact ordinary session that
was already running. A negative result is valid and leaves the polling product
honest and useful. It does not erase the intended intervention direction.

Only a successful, reproducible mechanism may justify production `watched`
status or become input to control-path qualification.

## Phase 3: Make the local polling product dependable

The remaining approved polling tickets add small tracer bullets without waiting
until final packaging to consider portability:

- [Ticket 03: text and JSON output](../.scratch/packwalk-post-launch-orientation/issues/03-offer-the-same-view-as-plain-text-and-json.md)
- [Ticket 04: distinct overlapping sessions](../.scratch/packwalk-post-launch-orientation/issues/04-keep-overlapping-codex-sessions-distinct.md)
- [Ticket 05: safe restoration and degradation](../.scratch/packwalk-post-launch-orientation/issues/05-restore-and-degrade-the-overview-safely.md)
- [Ticket 06: content-free evidence history](../.scratch/packwalk-post-launch-orientation/issues/06-inspect-content-free-evidence-history.md)
- [Ticket 07: deletion of PackWalk-owned data](../.scratch/packwalk-post-launch-orientation/issues/07-delete-packwalk-owned-session-data.md)
- [Ticket 08: schema upgrade and backup recovery](../.scratch/packwalk-post-launch-orientation/issues/08-recover-from-sqlite-schema-upgrades-and-backups.md)
- [Ticket 09: contention, rollback, and failed commits](../.scratch/packwalk-post-launch-orientation/issues/09-surface-sqlite-contention-rollback-and-failed-commits-safely.md)
- [Ticket 10: accumulated cross-platform verification](../.scratch/packwalk-post-launch-orientation/issues/10-verify-the-polling-product-on-windows-macos-and-linux.md)

## Phase 4: Qualify exact-target intervention

After the observation and identity seams can support it, write a separate action
specification and small tickets for deterministic `ask`, `steer`, `approve`,
`reject`, and `interrupt` operations. The specification must apply the accepted
two-step preparation and confirmation boundary, durable commit-before-dispatch,
exact conflict handling, at-most-once PackWalk dispatch, and explicit unknown
outcomes.

No action is exposed merely because it appears in the product roadmap. Each
operation requires an exact supported Codex path and its own acceptance
evidence. Starting an idle turn is not part of this phase and requires a
separate product decision.

## Phase 5: Add stateless natural-language routing

Once the deterministic commands are real, add the agent-powered CLI as a thin
routing surface over those commands:

- one fresh, small Codex routing turn per natural-language request;
- current utterance and minimal routing metadata only;
- no prior PackWalk routing history or persistent model state;
- a typed intent proposal rather than dispatch authority; and
- deterministic target resolution, ambiguity handling, confirmation, commit,
  and dispatch in PackWalk.

Explicit commands remain available and model-free.

## Bonus horizon: Remote supervision

After the local core is demonstrably successful, explore explicitly enabled
web, mobile, and cross-device supervision. Begin with a bounded read-only remote
snapshot and event-stream experiment. Treat remote consequential actions as a
separate authorization and reliability gate.

The [remote-supervision opportunity](future/remote-supervision.md) records the
entry criteria and invariants without choosing a provider or implementation.

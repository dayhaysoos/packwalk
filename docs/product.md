# PackWalk product model

## Problem

Developers can have several ordinary Codex sessions running at once, but
recovering what each session is doing, which work needs attention, and what can
be acted on safely requires repeatedly reopening terminals and reconstructing
context. A product that guesses activity, conflates sessions, or silently acts
on the wrong work would make that problem worse.

## Product promise

PackWalk is one local place to supervise ordinary Codex sessions that the user
started independently. It makes supported activity and attention legible, keeps
claims tied to named evidence and freshness, and is intended to support safely
qualified intervention against an exact selected session.

PackWalk's current polling slice is read-only. That is a delivery boundary, not
the definition of the finished product. The intended local product includes:

- machine-wide orientation across multiple distinct Codex sessions;
- trustworthy live observation where post-launch attachment can be qualified;
- exact-target questions and steering;
- approval and rejection of one exact supported pending request;
- interruption of one exact in-flight turn;
- durable, content-free action accounting; and
- a stateless, agent-powered natural-language command surface over the same
  deterministic actions.

## Capability horizons

| Horizon | Product meaning |
| --- | --- |
| Available now | Discover and poll one independently started Codex session, persist a minimal content-free view, and display it through a plain CLI. |
| Local product direction | Keep overlapping sessions distinct, establish trustworthy watched status where possible, and add exact-target ask, steer, approve, reject, and interrupt actions behind the accepted safety protocol. |
| Agent-powered interaction | Translate each natural-language request through one fresh, small Codex routing turn into a typed action proposal. The model has no persistent PackWalk conversation and no dispatch authority. |
| Bonus horizon | Explore explicitly enabled web, mobile, and cross-device remote supervision after the local core is demonstrably successful. |

An item outside the current polling specification is not automatically outside
PackWalk's product direction.

## Product boundary

PackWalk starts independently after Codex. It does not require launching Codex
through PackWalk, a wrapper command, `--remote` preconfiguration, a
PackWalk-owned app-server or relay, or PackWalk creation, resumption, restart,
replacement, or relaunch of a session.

PackWalk assists work without owning its lifecycle. The Codex TUI remains an
independently usable surface, and an action performed there is not silently
claimed as a PackWalk action. Starting an idle turn or initiating new work is
not part of the current intent; adding that behavior requires a separate
product decision.

Codex is the only supported agent. A narrow Codex adapter contains source and
capability details, but PackWalk does not contain a provider registry, provider
plugin system, or speculative cross-agent architecture.

## Core jobs

1. Locate and distinguish ordinary Codex sessions without changing how they
   were started.
2. Show supported project, identity, activity, attention, evidence source, and
   freshness without inventing unavailable facts.
3. Preserve a minimal, useful, content-free account through daemon and client
   restart.
4. Resolve a human-recognizable selection to one exact eligible session, turn,
   or approval request.
5. Where a control path is qualified, ask, steer, approve, reject, or interrupt
   with explicit consequences and durable action accounting.
6. Accept natural-language requests without turning the routing model into the
   owner of targeting, confirmation, or dispatch.

## Observation and intervention

Observation and intervention are visibly distinct. Reading status or retained
evidence does not modify Codex. Asking, steering, deciding an approval request,
or interrupting can affect work and therefore requires exact targeting,
eligibility, explicit confirmation, durable commit, and honest outcome
handling.

A discovered or polled session is not called `watched`. Trustworthy watched
status requires exact post-launch correlation and a supported live observation
path to the same independently started session. Direct intervention additionally
requires a qualified control path.

PackWalk never promises exactly-once provider effects. It guarantees at most
one PackWalk dispatch for one action ID and leaves a possible outcome `unknown`
rather than automatically repeating it.

## Stateless natural-language routing

Each natural-language request creates one fresh routing turn through the user's
authorized Codex path using the smallest model that passes the routing
contract. The turn receives only the current utterance, minimal current routing
metadata, and fixed typed action definitions. It receives no prior routing
turns, persisted model memory, captured transcript, or PackWalk action
authority.

The routing model may propose an intent and parameters. Deterministic PackWalk
code resolves exact identity, rejects ambiguity, checks eligibility, presents
confirmation, commits the action, and controls dispatch. Explicit commands and
menus remain model-free and exercise the same underlying operations.

Routing model state is discarded after the proposal. PackWalk may retain the
content-free action and audit facts required by its safety contract, but it does
not persist a routing conversation or retain user-authored interaction text by
default.

## Trust and privacy

Unsupported facts are unavailable rather than guessed. Process liveness alone
does not establish session identity, observation freshness, or an action
outcome.

PackWalk retains structural metadata only. Prompts, responses, command output,
diff content, terminal input, credentials, environment snapshots, raw IPC
bodies, and raw Codex payloads are excluded from durable state, logs, and public
contracts. Content-free action audit records are permitted; user-authored
interaction text is explicit Codex input but is not retained by default.

## Interface and portability

The human interface is a plain Node.js CLI. It may refresh its own lines after
a polling update, but it does not use an alternate screen, a terminal UI
framework, native UI bindings, or experimental runtime flags. One-shot text and
JSON commands consume the same daemon surface.

Windows, macOS, and Linux portability is considered in every applicable slice.
The local daemon remains authoritative independently of any connected CLI.

## Bonus remote horizon

After the local product is proven, PackWalk may extend the same supervision
experience to web, mobile, or another device. Remote supervision is explicit
opt-in and must not weaken the local-first product, daemon authority, exact
targeting, confirmation, privacy, audit, or unknown-outcome rules.

Remote observation and remote intervention are separate qualification steps.
No account system, gateway, synchronization design, hosting provider, or
client framework is selected today. See
[the future remote-supervision brief](future/remote-supervision.md).

## Delivery record

The [roadmap](roadmap.md) distinguishes the current polling delivery from the
intended product. [Current state](current-state.md) records what is actually
implemented and the next unresolved acceptance work.

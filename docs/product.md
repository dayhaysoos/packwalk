# PackWalk product model

## Product promise

PackWalk gives a developer one truthful local view of ordinary Codex sessions
they already started. It reduces the cost of recovering project and session
context while keeping every activity claim tied to a named evidence source and
visible freshness.

## Product boundary

PackWalk starts independently after Codex. It does not require launching Codex
through PackWalk, a wrapper command, `--remote` preconfiguration, a
PackWalk-owned app-server or relay, or PackWalk creation, resumption, restart,
replacement, or relaunch of a session.

Codex is the only supported agent. PackWalk does not contain a provider
registry or speculative provider architecture. It assists existing work and
does not initiate a Codex turn.

## First delivery

The first slice starts after at least one ordinary Codex TUI is running. It
discovers one exact session from the strongest supported local persisted
evidence, records a minimal content-free current view, exposes that view
through the daemon's public session surface, and displays it in an OpenTUI
client.

The view includes project, exact session identity, supported activity,
evidence source, and freshness. A bounded poll detects later persisted Codex
activity and visibly updates the view. The session is labelled `discovered` or
`polled`, never `live` or `watched`.

One repository-local `packwalk` command must start or connect to the daemon and
open the client. The user must not manually start several PackWalk components.

## Trust and privacy

Unsupported facts are unavailable rather than guessed. Process liveness alone
does not establish session identity or observation freshness. A trustworthy
post-launch live path is required before PackWalk may use `watched`.

PackWalk retains structural metadata only. Prompts, responses, command output,
diff content, terminal input, credentials, environment snapshots, and raw
Codex payloads are excluded from durable state, logs, and public contracts.

## Clients and portability

The initial interactive client is a lightweight terminal view, not a permanent
full-screen dashboard. Plain-text and JSON clients follow through the same
daemon surface. Windows, macOS, and Linux portability is considered in every
slice rather than deferred to final packaging.

## Later work

A separate bounded experiment may attempt one trustworthy post-launch live
Codex event. A negative result leaves the polling product useful and honest.
Consequential control remains unavailable until a separately approved exact
target, observation, and control path is qualified.

Release packaging, a global executable, login services, remote clients,
multi-user authorization, transcript search, and non-Codex agents are outside
the first slice.

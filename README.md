# PackWalk

PackWalk is a local supervision tool for ordinary Codex sessions that are
already running. It starts independently with truthful, read-only orientation
and is intended to add explicitly supported control actions without owning the
session or changing how Codex was launched.

## Status

PackWalk is currently specified for its first implementation slice. That
read-only slice discovers one existing Codex session, persists a content-free
current view, exposes it through the PackWalk daemon, and displays polling
updates in an OpenTUI client. It does not yet start Codex work, attach live, or
control a session.

## Product boundary

PackWalk must not require a wrapper command, `--remote` preconfiguration, a
PackWalk-owned app-server or relay, or PackWalk creation, resumption, restart,
replacement, or relaunch of a Codex session. A persisted or polled session is
labelled accordingly; `watched` is reserved for a separately qualified,
trustworthy post-launch live attachment. Consequential actions such as asking,
steering, approving, rejecting, or interrupting require an exact target and a
separately qualified observation and control path before PackWalk may offer
them.

## Project record

- [Product model](docs/product.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/README.md)
- [Active specification](.scratch/packwalk-post-launch-orientation/spec.md)
- [First implementation ticket](.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)

## Source availability

PackWalk is open source under the [MIT License](LICENSE).

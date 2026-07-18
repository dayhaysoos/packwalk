# PackWalk

PackWalk is a local, read-only orientation tool for ordinary Codex sessions
that are already running. It starts independently, discovers supported
persisted session evidence, and shows what it can establish without changing
how Codex was launched or claiming a live attachment it does not have.

## Status

PackWalk is at its first implementation slice. The approved slice discovers
one existing Codex session, persists a content-free current view, exposes it
through the PackWalk daemon, and displays polling updates in an OpenTUI client.
It does not start Codex work, attach live, or control a session.

## Product boundary

PackWalk must not require a wrapper command, `--remote` preconfiguration, a
PackWalk-owned app-server or relay, or PackWalk creation, resumption, restart,
replacement, or relaunch of a Codex session. A persisted or polled session is
labelled accordingly; `watched` is reserved for a separately qualified,
trustworthy post-launch live attachment.

## Project record

- [Product model](docs/product.md)
- [Domain language](CONTEXT.md)
- [Architecture decisions](docs/adr/README.md)
- [Active specification](.scratch/packwalk-post-launch-orientation/spec.md)
- [First implementation ticket](.scratch/packwalk-post-launch-orientation/issues/01-display-one-ordinary-running-codex-session.md)

## Source availability

PackWalk is open source under the [MIT License](LICENSE).

# Verify the polling product on Windows, macOS, and Linux

Status: ready-for-agent
Blocked by: 03, 04, 05, 07, 08, 09
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

Final accumulated portability evidence for the honest polling product on
Windows, macOS, and Linux. Ticket 02 is intentionally not a blocker because
trustworthy live attachment may remain unavailable.

## Acceptance criteria

- [ ] Windows, macOS, and Linux each exercise the deterministic daemon,
      node:sqlite storage, local IPC, OpenTUI, plain-text, and JSON behavior
      delivered by the blocking tickets.
- [ ] Unix-domain socket and Windows named-pipe paths are verified with
      per-user access, reconnect, shutdown, and stale-endpoint behavior.
- [ ] The supported Node patch, exact Effect cohort, OpenTUI renderer/native
      requirements, and Bun-free commands are recorded for every platform.
- [ ] The polling view, history, deletion, restart, backup/upgrade, and failed
      commit behavior have equivalent user-visible semantics on all three
      operating systems.
- [ ] Platform-specific gaps fail cleanly and are documented without upgrading
      discovered or polled sessions to live/watched status.
- [ ] This ticket verifies portability already considered in earlier tickets;
      it does not retrofit a macOS-specific implementation at the end.

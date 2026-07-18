# Recover from SQLite schema upgrades and backups

Status: ready-for-agent
Blocked by: 05
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

Externally visible, recoverable behavior when PackWalk upgrades its SQLite
schema or creates/restores a backup.

## Acceptance criteria

- [ ] A representative prior PackWalk schema upgrades forward transactionally
      and preserves the user-visible session view and history.
- [ ] PackWalk creates a SQLite-aware backup before upgrade; it never treats a
      live copy of only the main database file as a valid backup.
- [ ] Upgrade or backup failure leaves the prior data usable or returns a typed
      recovery state with a concrete safe next action; partial upgraded state
      is never presented as current.
- [ ] Restore produces the same externally visible daemon view and provenance
      expected from the backed-up commit point.
- [ ] Backup locations, atomic replacement, and file handling are designed and
      tested against Windows, macOS, and Linux semantics rather than one host.

This ticket does not create an exhaustive SQLite qualification campaign.

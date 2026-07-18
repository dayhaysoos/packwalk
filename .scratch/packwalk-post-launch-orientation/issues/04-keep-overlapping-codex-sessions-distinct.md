# Keep overlapping Codex sessions distinct

Status: ready-for-agent
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

A multi-session overview that never mixes identity or activity when Codex
sessions overlap, share a repository, or have duplicate display labels.

## Acceptance criteria

- [ ] At least two concurrently discoverable sessions appear as distinct rows
      through the daemon surface and OpenTUI view.
- [ ] Two sessions in one repository remain distinct by exact Codex identity;
      project paths and human labels are not used as session identity.
- [ ] A polling change for one session cannot alter another session's activity,
      evidence, freshness, or commit identity.
- [ ] Ambiguous or duplicate source evidence fails visibly instead of being
      attached to an arbitrary session.
- [ ] Identity and path comparisons have explicit Windows, macOS, and Linux
      behavior, including platform case and separator differences.

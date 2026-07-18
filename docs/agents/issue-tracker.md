# Issue Tracker: Local Markdown

Issues and specs for this repository live as Markdown files in `.scratch/`.
Do not use a remote issue tracker unless this configuration is deliberately
changed later.

## Conventions

- One feature or effort per directory: `.scratch/<feature-slug>/`
- The specification is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are individual files at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Do not create a single combined tickets file.
- Triage state is a `Status:` line near the top of each issue file.
- Comments and conversation history append under a `## Comments` heading.

## Publishing and fetching

When a skill says to publish to the issue tracker, create the appropriate file
under `.scratch/<feature-slug>/`, creating directories when needed.

When a skill says to fetch a ticket, read the referenced local Markdown file.
The user will normally supply its path or issue number.

## Wayfinding operations

Wayfinder uses one map with one child file per investigation:

- **Map:** `.scratch/<effort>/map.md`, containing Notes,
  Decisions-so-far, and Fog.
- **Child ticket:** `.scratch/<effort>/issues/NN-<slug>.md`, with a `Type:`
  line (`research`, `prototype`, `grilling`, or `task`) and a `Status:` line
  (`claimed` or `resolved`).
- **Blocking:** `Blocked by: NN, NN` near the top. A ticket is unblocked when
  every listed ticket is resolved.
- **Frontier:** Scan for open, unblocked, unclaimed tickets. The lowest ticket
  number wins.
- **Claim:** Set `Status: claimed` and save before starting work.
- **Resolve:** Append the result under `## Answer`, set `Status: resolved`, and
  append a concise context pointer and link to the map's Decisions-so-far.


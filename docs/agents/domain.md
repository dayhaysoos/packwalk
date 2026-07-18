# Domain Docs

This is a single-context repository. The engineering skills should use the
following documentation when exploring or changing the project.

## Before exploring

- Read `CONTEXT.md` at the repository root.
- Read ADRs under `docs/adr/` that affect the area under consideration.
- If a file does not exist, proceed silently. Domain-modeling workflows create
  documentation when terminology or decisions are actually resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/
```

## Use the glossary vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. Do not
drift to synonyms the glossary explicitly avoids.

If a necessary concept is absent, reconsider whether the term belongs to the
project or record the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly
instead of silently overriding the earlier decision.


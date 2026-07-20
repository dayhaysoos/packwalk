# Domain documentation

PackWalk is a single-context repository. Its documents have different jobs and
must not be treated as interchangeable sources of authority.

## Before exploring or changing the product

Read, in order:

1. `docs/product.md` for the complete product promise and boundaries.
2. `CONTEXT.md` for canonical domain language.
3. `docs/roadmap.md` and `docs/current-state.md` for direction and current
   implementation status.
4. `docs/adr/README.md` and the ADRs relevant to the work.
5. The active specification and exact ticket under `.scratch/`.

Read `docs/history/agent-watch-lineage.md` only when provenance matters. The
unpublished Agent Watch corpus is evidence and cannot create PackWalk scope by
itself.

## Document roles

- `CONTEXT.md` is a glossary. It contains product-specific terms and no
  implementation specification.
- `docs/product.md` defines the durable product direction. A current release
  limitation does not become a permanent product boundary merely because it is
  implemented first.
- ADRs record accepted hard-to-reverse decisions and their reasons.
- `docs/roadmap.md` orders intended work without authorizing implementation.
- `docs/current-state.md` reports implementation and acceptance facts and must
  be updated when those facts change.
- `.scratch/` specs and tickets define bounded delivery slices. Their scope
  guards do not silently supersede product or architecture authority.

## Use glossary vocabulary

Use the terms defined in `CONTEXT.md` and avoid its rejected synonyms. If a
necessary product concept is absent, record the gap rather than inventing an
overlapping term.

## Surface conflicts

If a proposed change contradicts the product model, glossary, or an accepted
ADR, identify the exact conflict and obtain a new decision. Do not resolve it by
reviving Agent Watch mechanisms or by treating historical evidence as a locked
PackWalk requirement.

# Use a plain command-line interface

Status: accepted

During the pre-spec architecture grill on 2026-07-18, PackWalk rejected a
persistent full-screen dashboard and selected a CLI-only product. That decision
was not captured in the initial public history; commit
`edace4eb7d69205997f2dc4a61cc8510c0ac9ab4` inadvertently specified a
renderer-backed terminal client instead. This ADR restores the accepted
boundary.

PackWalk's human interface is a plain Node.js CLI. It may refresh its own lines
when polling discovers persisted Codex changes, but it does not initialize a
terminal rendering framework, switch to an alternate screen, depend on native
UI bindings, or require experimental runtime flags. The daemon and public
session seam remain independent of presentation. Later one-shot text and JSON
commands may consume the same view model.

A richer terminal presentation requires a separate architecture decision.

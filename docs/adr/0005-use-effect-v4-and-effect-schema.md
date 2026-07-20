# Use Effect v4 and Effect Schema as application authorities

Status: accepted

PackWalk uses one exactly pinned Effect v4 cohort as its sole application
orchestration and effect runtime despite the accepted pre-stable maturity risk.
Effect owns services, Layers, resource scopes, fibers, cancellation, queues,
streams, scheduling, configuration, logging, and test infrastructure. Long-lived
workers and stream consumers are Layer-owned and use structured concurrency.
PackWalk does not use XState, and it does not adopt Effect Workflow initially.
Any future Effect Workflow adoption requires a separate decision showing that
SQLite authority, at-most-once PackWalk dispatch, and unknown-outcome rules are
preserved.

Effect Schema is the sole application runtime validation, decoding, and
encoding authority for Codex-normalized facts, database rows, commands, events,
action records, IPC contracts, view models, and public errors. SQLite DDL and
constraints remain authoritative storage enforcement, and Codex's native
protocol remains authoritative before the adapter converts accepted input into
PackWalk models. No second validation ecosystem is introduced without a
separately approved demonstrated gap.

Persisted and process-crossing states and events use schema-backed tagged
unions. Purely internal decisions may use Effect data tagged enums. The
authoritative action lifecycle uses one pure, exhaustive transition function
that returns typed illegal-transition failures and performs no side effects.
SQLite remains durable authority, while presentation-local state may remain
local to a client.

All Effect packages are pinned to a verified compatible cohort without
floating ranges. Upgrades are deliberate qualification work, and repository
rules plus the pinned source version take precedence over generic guidance.

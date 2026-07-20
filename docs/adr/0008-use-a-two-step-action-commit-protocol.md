# Use a two-step action commit protocol

Status: accepted

Consequential PackWalk actions use preparation followed by explicit
confirmation and atomic commitment. This protocol protects exact targeting,
at-most-once PackWalk dispatch, and unknown-outcome handling without treating a
local action ID as a bearer secret or adding a one-time confirmation challenge.

Preparation resolves and persists the exact Codex target, state revision,
conflict key, execution mode, capability version, adapter/source epoch, expiry,
and risk disclosure. It issues an immutable random action ID and preparation
version but does not reserve the conflict key. Looking up that action ID is
read-only.

`ConfirmAction` contains the action ID and preparation version and expresses
confirmation intent through its command type. The daemon rereads the
preparation and completely revalidates target, revision, freshness, capability,
epoch, execution mode, disclosure, and expiry. In one transaction it
compare-and-sets `prepared` directly to `committed`, appends the confirmation
audit fact, and reserves the exact conflict key. Commit must return successfully
before PackWalk reports success or permits dispatch. No separate current
`confirmed` state is persisted.

Duplicate, stale, expired, illegal, or competing confirmations return typed
results and cannot dispatch. Codex calls occur outside the transaction only
after durable pre-dispatch state exists. PackWalk automatically retries no
Codex operation unless that exact operation has demonstrated idempotency; a
possible or unknown result remains explicit and is never automatically
redispatched. Late acknowledgements append correlated facts to the original
action.

The local single-user IPC boundary needs no capability token, confirmation
challenge, or challenge digest. If remote clients, multiple users, delegated
approval, or another authorization boundary is introduced later, its threat
model may require a separately approved authorization protocol without
weakening this durable action boundary.

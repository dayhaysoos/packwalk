# Define PackWalk as post-launch supervision and intervention

Status: accepted

PackWalk's first implementation is read-only, which made it easy to mistake a
delivery boundary for the product boundary. PackWalk is a local supervision and
intervention product for ordinary Codex sessions the user started
independently: orientation comes first, while safely qualified `ask`, `steer`,
`approve`, `reject`, and `interrupt` operations are intentional product
capabilities rather than speculative extras.

PackWalk never offers an intervention until it can resolve one exact eligible
target and qualify the required post-launch observation and control paths. It
does not require a wrapper, special Codex launch configuration, owned
app-server, relay, creation, resume, restart, replacement, or relaunch. Starting
an idle turn or otherwise initiating new work is not current product intent and
requires a separate future decision.

Codex is the sole supported agent. PackWalk may isolate Codex details behind an
adapter, but it does not adopt a provider registry or speculative cross-agent
architecture. Remote supervision remains a gated bonus horizon after the local
core succeeds; it is neither a current blocker nor permanently prohibited.

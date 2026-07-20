# Use stateless Codex routing for natural-language commands

Status: accepted

PackWalk is intended to accept natural-language requests without becoming a
persistent supervisory chat or allowing a model to own consequential
decisions. Every natural-language request therefore creates one fresh routing
turn through the user's authorized Codex path using the smallest model that
passes the routing contract.

The routing turn receives only the current utterance, minimum current
content-free routing metadata, and fixed typed action definitions. It receives
no prior routing turns, transcript, evidence archive, persistent model state,
or dispatch capability. It may propose an intent and parameters; deterministic
PackWalk code resolves exact identity, rejects ambiguity, checks eligibility,
presents confirmation, durably commits, and dispatches through the action
protocol. Explicit commands and menus remain model-free and use the same
operations.

Routing context is discarded after the proposal. PackWalk retains only the
content-free action and audit facts required by its durable safety contract;
user-authored interaction text and routing-model state are not retained by
default. This routing layer is implemented after the underlying deterministic
commands, never as a substitute for them.

# Require post-launch attachment to independently launched Codex sessions

Status: accepted

Clarified by: [ADR 0003](0003-define-post-launch-supervision-and-intervention.md)

PackWalk starts independently and connects to ordinary Codex sessions the user
already started. Persisted discovery and polling may support an explicitly
labelled early view, but `watched` requires exact identity and a trustworthy
post-launch live observation path to the same running session. PackWalk must
not substitute a wrapper, `--remote` prerequisite, PackWalk-owned app-server
or relay, or session creation, resume, restart, replacement, or relaunch for
that missing capability.

Qualified direct interaction is part of PackWalk's intended product direction,
but it remains unavailable until its exact post-launch target, observation, and
control paths are demonstrated. This availability gate does not redefine
PackWalk as a permanently read-only product.

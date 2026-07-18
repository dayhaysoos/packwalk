# Require post-launch attachment to independently launched Codex sessions

Status: accepted

PackWalk starts independently and connects to ordinary Codex sessions the user
already started. Persisted discovery and polling may support an explicitly
labelled early view, but `watched` requires exact identity and a trustworthy
post-launch live observation path to the same running session. PackWalk must
not substitute a wrapper, `--remote` prerequisite, PackWalk-owned app-server
or relay, or session creation, resume, restart, replacement, or relaunch for
that missing capability.

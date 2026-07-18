# PackWalk

PackWalk helps one local user orient across Codex work without owning or
changing the Codex sessions being observed.

## Language

**Ordinary Codex session**:
A Codex session the user started independently of PackWalk through a normal
Codex surface.
_Avoid_: PackWalk session, managed session

**Session identity**:
The exact Codex-issued identity of one Codex session, independent of its
project, label, terminal, or process.
_Avoid_: Project identity, terminal identity, process identity

**Project identity**:
The repository root when available, otherwise the exact working directory
associated with a session. It is not session identity.
_Avoid_: Session identity, display label

**Discovered session**:
An ordinary Codex session whose exact identity PackWalk found through a
supported local persisted source, without a trustworthy live attachment.
_Avoid_: Live session, watched session

**Polled session**:
A discovered session whose supported persisted evidence PackWalk reread after
startup. Polling may lag or miss transient activity.
_Avoid_: Live session, streamed session

**Watched session**:
A discovered session for which PackWalk has established exact identity and a
trustworthy post-launch live observation path without changing its lifecycle.
_Avoid_: Discovered session, polled session

**Session view**:
PackWalk's current content-free representation of one session identity,
project, supported activity, evidence source, and freshness.
_Avoid_: Transcript, raw provider record

**Supported activity**:
The strongest structural activity claim justified by the available evidence.
Unsupported detail is unavailable rather than inferred.
_Avoid_: Intent, reasoning, guessed activity

**Evidence source**:
The named local mechanism from which a PackWalk claim was established.
_Avoid_: Proof, authority without qualification

**Freshness**:
How recently PackWalk obtained the evidence behind a claim and whether that
evidence remains available.
_Avoid_: Liveness, certainty

**Content-free evidence**:
Structural session metadata that excludes prompts, responses, command output,
diffs, terminal input, credentials, and raw Codex payloads.
_Avoid_: Transcript capture, raw event archive

**Assistance-only boundary**:
The current product boundary in which PackWalk observes work the user already
started and never starts, resumes, restarts, replaces, or relaunches it.
_Avoid_: Session orchestration, launch wrapper

**Consequential action**:
A command that can change a Codex session or its work. Consequential actions
are outside the first PackWalk slice.
_Avoid_: Query, inspection

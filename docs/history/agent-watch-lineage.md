# Agent Watch lineage

PackWalk grew from an unpublished Agent Watch discovery and qualification
effort. That archive contains useful product decisions alongside superseded
topologies, provider-specific experiments, generated artifacts, and private
machine metadata. The public PackWalk repository is self-contained and does
not depend on access to that archive.

This record classifies what was recovered rather than copying the old files or
treating every historical row as a PackWalk requirement.

## Accepted PackWalk invariants

The following conclusions were reaffirmed for PackWalk and are recorded in the
current product model, glossary, and ADRs:

- supervision includes truthful orientation and safely qualified intervention;
- PackWalk starts independently and assists ordinary Codex sessions that were
  already started by the user;
- PackWalk does not require a wrapper, special launch configuration, owned
  app-server, relay, creation, resume, restart, replacement, or relaunch;
- multiple sessions and exact identity matter independently of project labels;
- consequential actions require deterministic exact targeting, eligibility,
  explicit confirmation, durable commit, and honest outcomes;
- the daemon, not a connected CLI, owns PackWalk action responsibility;
- at-most-once PackWalk dispatch does not imply exactly-once Codex effects;
- possible or unknown outcomes are never automatically repeated;
- action audit is content-free by default; and
- the intended agent-powered CLI uses a fresh, stateless routing turn whose
  model cannot confirm or dispatch.

## Historical Agent Watch decisions

The old name, executable aliases, MVP timing, presentation ideas, and
provider-neutral aspirations describe Agent Watch's evolution. They are useful
provenance but do not create PackWalk requirements.

In particular, the earlier assertion that every interactive capability had to
ship in the first MVP was superseded by PackWalk's polling-first vertical
slices. The intervention direction remains; the old release schedule does not.

## Provider-specific qualification evidence

Historical synthetic experiments exercised exact targeting, competing actions,
client disconnect, service restart, content-free audit, and unknown-outcome
handling against old Codex surfaces. Those results support the safety model as
evidence, but they do not qualify a current Codex release, authorize production
control, or require PackWalk to reproduce the old harness.

## Candidate mechanisms

Historical code and research proposed particular Codex transports, observation
surfaces, model choices, UI flows, retention options, and release gates. None
is selected merely because a prototype used it. Current PackWalk requirements
must justify a mechanism against the post-launch boundary and current runtime
architecture.

The stateless natural-language routing capability is no longer merely a
candidate: its bounded product and authority rules were explicitly reaffirmed
for PackWalk. Its exact model, prompt, and tool protocol remain future
qualification choices.

## Superseded or unnecessary assumptions

PackWalk does not inherit:

- the Agent Watch name or executable aliases;
- wrapper-launched or pre-registered Codex sessions;
- an owned app-server, local observational relay, or special launch option;
- exact-build relay qualification campaigns or their release blockers;
- a persistent full-screen dashboard, native renderer, or visual village;
- a provider registry or speculative non-Codex architecture;
- model authority to resolve ambiguous targets or dispatch actions;
- starting idle turns, reopening, resuming, or relaunching Codex work;
- remote, multi-user, delegated-approval, or cryptographic-capability machinery
  in the local core; or
- rich optional transcript, prompt, response, command-output, or diff capture.

The final relay-era work item was resolved as superseded by the post-launch
boundary and must not be resumed. Its artifacts remain historical evidence
only.

## Public-safety treatment

No historical program, binary, raw trace, protocol payload, qualification
manifest, machine path, email address, environment value, or generated runtime
artifact is copied into PackWalk. Current PackWalk documents restate only the
accepted, public-safe conclusions needed for a fresh agent to understand the
product and its safety boundaries.

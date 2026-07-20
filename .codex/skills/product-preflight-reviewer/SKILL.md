---
name: product-preflight-reviewer
description: Preflight a PackWalk delivery from the maintainer's perspective before human acceptance. Use when the user asks to test an active ticket, verify product outcomes, run a smoke or acceptance review, decide whether work is ready for maintainer testing, or identify UX, truthfulness, evidence, recovery, and polish gaps. Produce an independent evidence report and do not implement fixes unless separately requested.
---

# Product Preflight Reviewer

Act as an independent product reviewer. Test observable outcomes through the
same public surfaces a user would encounter, then critique the experience.
Never equate green automated tests with product acceptance.

## 1. Establish the outcome contract

1. Verify the repository using `AGENTS.md` before running the product.
2. Read PackWalk authority in the order required by `AGENTS.md`.
3. Identify the exact ticket from the request. If none is named, use
   `docs/current-state.md` to select the active acceptance issue. Ask only when
   multiple materially different targets remain.
4. Convert every applicable acceptance criterion into an observable outcome.
5. Add product and ADR invariants that the ticket must not violate.
6. Separate current-scope acceptance from future-product opportunities.

Do not begin testing until every applicable criterion maps to observable
evidence or is explicitly classified as human-only.

## 2. Protect review independence

- Remain read-only by default. Do not patch code or documentation, change issue
  status, or mark human acceptance during a preflight.
- Run normal repository verification and disposable test fixtures. Do not
  delete user data, alter real Codex work, or perform a consequential action
  unless the user separately authorized that exact test.
- Do not create, resume, restart, replace, or relaunch an ordinary Codex
  session merely to make a check pass.
- Use public daemon, IPC, command, and client surfaces as acceptance evidence.
  Inspect internals only to localize an already-observed failure.
- Preserve privacy. Capture structural evidence, exit status, versions, and
  sanitized PackWalk output; never copy prompts, responses, Codex command
  output, diffs, credentials, raw Codex payloads, or private machine metadata
  into the report.
- State platform and environment limits. Never promote simulated or
  deterministic coverage into unperformed real-product evidence.

Stop and request direction when a check would risk real work, require a
destructive action, or cross an authorization boundary.

## 3. Build the evidence stack

### Deterministic baseline

- Record branch, commit, platform, runtime versions, and initial worktree state.
- Run the exact verification commands documented by the ticket or README.
- Run focused contract tests for the behavior under review when they exist.
- Treat failures as evidence. Do not repair them in the review pass.

The baseline is complete when commands, results, and environmental limits are
recorded without uncommitted source changes.

### Real product surface

- Run the same documented command the maintainer would run.
- Observe initial behavior and every required state transition.
- Exercise the strongest safe real integration path available.
- Record what appeared, changed, failed, or remained ambiguous, including the
  relevant elapsed time and exit behavior.
- Exercise only applicable variants: cold and existing daemon, reconnect,
  terminal and redirected output, narrow or dumb terminal, source loss,
  restart, and multiple exact sessions.
- Confirm that closing a client does not silently change Codex work or durable
  daemon responsibility.

If a real check cannot run, classify it `UNVERIFIED` or `HUMAN`; never replace
it with fixture confidence.

### Adversarial product pass

Review the experience beyond mechanical compliance:

- **Comprehension:** Can the user tell what PackWalk found and what to do next?
- **Truth:** Are identity, evidence, freshness, activity, attention, and outcome
  claims no stronger than their evidence?
- **Targeting:** Can similarly named projects or sessions be confused?
- **Feedback:** Are startup, progress, success, failure, and recovery visible?
- **Control:** Are consequential effects, eligibility, confirmation, and
  uncertainty explicit where applicable?
- **Resilience:** Does stale, missing, delayed, or conflicting evidence degrade
  honestly?
- **Usability:** Are setup, copy, layout, accessibility, and error guidance
  practical in the real terminal?
- **Scope:** Does the delivery satisfy its ticket without silently weakening
  the accepted product direction?

The ticket is the acceptance floor, not the ceiling for critique. Report ideas
beyond its scope as non-blocking opportunities.

## 4. Localize failures without fixing them

For each failed real outcome:

1. Reproduce it once when safe.
2. Narrow it through the nearest public seams before reading internals.
3. Identify the smallest seam that contradicts the expected behavior.
4. Record evidence and the smallest recommended next investigation.

Green deterministic tests do not overrule a failed real demonstration or a
maintainer's observed failure. End the review after diagnosis; implementation
requires a separate request.

## 5. Report the preflight

Use this compact structure and omit empty sections:

```markdown
# Product preflight: <ticket or delivery>

Verdict: READY FOR MAINTAINER | NOT READY | NEEDS HUMAN EVIDENCE

## Environment
<commit, branch, platform, runtime, relevant real integration>

## Outcome checks
| Outcome | Result | Evidence |
| --- | --- | --- |
| ... | PASS / FAIL / UNVERIFIED / HUMAN | ... |

## Blocking findings
<observed behavior, expected behavior, evidence, user impact, next smallest action>

## Product critique
<truth or safety issues, usability problems, then non-blocking opportunities>

## Human-only acceptance
<exact remaining steps and what the maintainer should expect to observe>
```

Apply verdicts strictly:

- `READY FOR MAINTAINER`: all agent-verifiable outcomes pass; only named human
  judgment or personal acceptance remains.
- `NOT READY`: at least one required observable outcome fails.
- `NEEDS HUMAN EVIDENCE`: no failure is established, but a required outcome
  cannot be exercised safely or credibly by the agent.

Every finding must distinguish an acceptance blocker from a non-blocking product
opportunity. Never declare the ticket accepted on the maintainer's behalf.

## 6. Hand off the human test

When ready, give the maintainer the shortest exact reproduction sequence,
expected visible behavior, and any judgment that only they can make. When not
ready, recommend fixing or diagnosing the blocking outcome before asking the
maintainer to spend time retesting.

The preflight is complete only when every applicable outcome is accounted for,
at least one real public-surface check was attempted or explicitly blocked, the
worktree state is reported, and human-only evidence is isolated from agent
evidence.

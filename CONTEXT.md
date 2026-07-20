# PackWalk

PackWalk is the domain of local post-launch supervision across ordinary Codex
sessions. It keeps truthful observation, consequential intervention, and Codex
session-lifecycle ownership distinct.

## Session supervision

**Supervision**:
The human workflow of orienting, following, inspecting, and—where qualified—
intervening across Codex sessions while their work continues.
_Avoid_: Read-only monitoring, session ownership

**Orientation**:
Locating exact sessions and understanding supported activity, freshness, and
where attention belongs without changing Codex work.
_Avoid_: Intervention, transcript review

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

**Post-launch boundary**:
PackWalk starts after ordinary Codex work and does not require creating,
resuming, restarting, replacing, relaunching, or interposing on that work.
_Avoid_: Assistance-only boundary, launch wrapper

**Discovered session**:
An ordinary Codex session whose exact identity PackWalk found through a
supported local persisted source, without a trustworthy live attachment.
_Avoid_: Live session, watched session

**Polled session**:
A discovered session whose supported persisted evidence PackWalk rereads after
startup. Polling may lag or miss transient activity.
_Avoid_: Live session, streamed session

**Watched session**:
A discovered session for which PackWalk established exact identity and a
trustworthy post-launch live observation path without changing its lifecycle.
_Avoid_: Discovered session, polled session

**Session view**:
PackWalk's current content-free representation of one session identity,
project, supported activity, evidence source, and freshness.
_Avoid_: Transcript, raw Codex record

**Supported activity**:
The strongest structural activity claim justified by available evidence.
Unsupported detail is unavailable rather than inferred.
_Avoid_: Intent, reasoning, guessed activity

**Evidence source**:
The named local mechanism from which a PackWalk claim was established.
_Avoid_: Proof, unqualified authority

**Freshness**:
Whether the evidence behind the current published view remains supported at
its latest meaningful observation. Freshness never follows from process
liveness alone.
_Avoid_: Liveness, certainty

**Content-free evidence**:
Structural session or action metadata that excludes prompts, responses,
command output, diffs, terminal input, credentials, and raw Codex payloads.
_Avoid_: Transcript capture, raw event archive

## Interaction

**Interaction intent**:
One requested PackWalk operation such as `status`, `ask`, `steer`, `approve`,
`reject`, `interrupt`, or `inspect`. Recognizing an intent grants no authority
to choose an ambiguous target or dispatch an action.
_Avoid_: Free-form authority, model command

**Session question**:
User-authored, model-visible text proposed for one exact existing Codex
session. Whether an idle question may start new work is a separate product
decision and is not implied by this term.
_Avoid_: Evidence query, transcript question

**Steering**:
Model-visible guidance sent to one exact eligible active turn. Delivery does
not prove that the working model followed the guidance.
_Avoid_: New turn, compliance

**Approval decision**:
A one-time approval or rejection bound to one exact supported pending request.
It grants no session-wide permission.
_Avoid_: Standing approval, policy grant

**Interruption**:
A request to terminate one exact in-flight turn without closing its session or
promising rollback of effects already performed.
_Avoid_: Session deletion, rollback

**Consequential action**:
A PackWalk command that can change a Codex session or its work, including a
session question, steering, approval decision, or interruption.
_Avoid_: Query, inspection

**Exact target**:
The specific Codex session and, where required, turn or pending request to
which a consequential action could apply.
_Avoid_: Project label, terminal window

**Exact target resolution**:
Deterministic mapping from a human-recognizable selection to one exact target.
Ambiguity requires explicit user selection and is never settled by model
inference alone.
_Avoid_: Fuzzy routing, best match

**Action eligibility**:
The current judgment that one interaction intent may be prepared for an exact
target under its observed state, freshness, and supported capabilities.
_Avoid_: Availability by assumption

**Prepared action**:
A not-yet-dispatched consequential action bound to an exact target, state
revision, execution mode, expiry, and visible risk disclosure.
_Avoid_: Pending command, authorization token

**Action confirmation**:
The user's explicit intent to commit one prepared action after reviewing its
exact target and behavior. Confirmation is invalid when the preparation is
stale or no longer eligible.
_Avoid_: Possession proof, remembered permission

**Action ID**:
An immutable PackWalk identity for one action lifecycle. Looking it up is
read-only and possession of it does not authorize mutation.
_Avoid_: Capability token, bearer secret

**Action conflict key**:
The narrowest exact target and revision on which PackWalk actions are mutually
exclusive. It cannot lock Codex or prevent an independent Codex-surface action.
_Avoid_: Project lock, session ownership

**Committed action**:
A prepared action that PackWalk durably accepted after confirmation and now
owns for dispatch, reconciliation, outcome reporting, and audit.
_Avoid_: Confirmed-only state, provider success

**At-most-once PackWalk dispatch**:
The guarantee that PackWalk sends no more than one Codex request for one action
ID. It is not an exactly-once Codex-effect guarantee.
_Avoid_: Exactly-once action, automatic replay

**Dispatch certainty**:
What PackWalk can establish about whether an action request crossed its Codex
adapter boundary. It remains independent of whether Codex accepted or applied
the action.
_Avoid_: Action outcome, provider success

**Action outcome**:
PackWalk's durable conclusion about one consequential action. A possible but
unresolved effect remains `unknown` and is never automatically repeated.
_Avoid_: Dispatch certainty, assumed failure

**External Codex action**:
An interaction performed through a Codex-owned surface rather than PackWalk.
PackWalk may reconcile its observed effects but does not claim it as a PackWalk
dispatch.
_Avoid_: PackWalk action

**Audit fact**:
An immutable, content-free record of a consequential action boundary. Later
evidence appends a correlated correction rather than rewriting the retained
fact.
_Avoid_: Transcript, mutable action log

## Command surfaces

**Plain CLI view**:
PackWalk's ordinary terminal presentation of session views. It may refresh its
own lines but is not a persistent full-screen terminal application.
_Avoid_: Dashboard, alternate-screen application

**Explicit command**:
A model-free PackWalk command whose intent and parameters are supplied
directly. It exercises the same deterministic operation used by routed natural
language.
_Avoid_: Routing turn

**Routing turn**:
One fresh, small Codex-model invocation that translates a single
natural-language request into a typed interaction proposal. It has no prior
PackWalk conversation or persistent model state.
_Avoid_: Routing session, PackWalk chat history

**Routing metadata**:
The minimum current, content-free selectors, states, and eligibility summaries
needed to propose an interaction intent. It grants no authority to resolve
ambiguity, confirm, or dispatch.
_Avoid_: Transcript context, action capability

## Future access

**Remote supervision**:
Explicitly enabled PackWalk access across a device or local-user boundary. A
web interface on the same machine is not remote supervision merely because it
uses a browser.
_Avoid_: Local web client, implicit tunnel

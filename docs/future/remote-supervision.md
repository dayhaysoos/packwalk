# Future remote supervision

Status: product opportunity, not an active implementation requirement

## Desired outcome

If the local core succeeds, explore a seamless way to orient and—where
separately authorized—intervene through PackWalk from a web browser, mobile
device, or another machine. Remote access should extend the local product
rather than replace it.

## Entry gate

Do not begin remote architecture or implementation until the local product has
demonstrated:

1. dependable multi-session supervision;
2. trustworthy live attachment where a supported Codex path permits it;
3. safe deterministic intervention;
4. stateless natural-language routing over those deterministic actions;
5. daemon restart and unknown-outcome recovery;
6. a stable, versioned public daemon protocol; and
7. verified Windows, macOS, and Linux behavior.

The gate is a prioritization rule, not a claim that these capabilities already
exist.

## Invariants for exploration

- The complete local product remains useful without an account, cloud service,
  or internet connection.
- Remote supervision is explicit opt-in and disabled by default.
- A remote client consumes a versioned PackWalk service contract; it never
  reads SQLite or Codex storage directly.
- The local daemon remains the sole authoritative writer unless a separately
  approved architecture decision changes that boundary.
- Remote transport does not weaken exact targeting, confirmation, at-most-once
  PackWalk dispatch, audit, deletion, or unknown-outcome handling.
- Captured evidence never crosses the device boundary implicitly.
- Remote observation and remote consequential actions are qualified separately.
- Strong authentication, encrypted transport, exact device and user identity,
  revocation, replay protection, and action authorization require a dedicated
  threat model before remote control.
- A local browser client is not automatically remote supervision; crossing a
  device or local-user boundary creates the new trust boundary.

## First bounded exploration

1. Define the remote threat model and acceptable trust boundary.
2. Prototype one opt-in, read-only remote snapshot and committed event stream
   through the public daemon seam.
3. Record portability, privacy, disconnect, and revocation behavior.
4. Only after that result, decide whether to qualify remote consequential
   actions.
5. Select web, mobile, gateway, account, and deployment technologies only when
   evidence makes the choice necessary.

## Deliberately undecided

No gateway or hosting provider, account system, synchronization mechanism,
web framework, mobile framework, public listener, tunnel, or cloud authority is
selected. Those are future decisions, not placeholders to implement in the
local core.

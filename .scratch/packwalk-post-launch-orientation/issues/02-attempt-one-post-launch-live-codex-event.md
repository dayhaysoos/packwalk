# Attempt one post-launch live Codex event

Status: needs-info
Blocked by: 01
Spec: [PackWalk post-launch session orientation](../spec.md)

## What this delivers

One bounded experiment, completable in one fresh implementation session, that
tests whether PackWalk can correlate one newly emitted live event to the exact
ordinary Codex session that was already running when PackWalk started.

This experiment decides what PackWalk may truthfully call `watched`; it does
not redefine PackWalk as permanently read-only. The intended intervention
direction remains recorded in
[ADR 0003](../../../docs/adr/0003-define-post-launch-supervision-and-intervention.md),
while actual control stays unavailable until an exact observation and control
path is separately qualified.

## Acceptance criteria

- [ ] The experiment begins with an ordinary Codex TUI, starts PackWalk later,
      and does not introduce a wrapper, `--remote` prerequisite, PackWalk-owned
      app-server or relay, session creation, resume, restart, or replacement.
- [x] Success requires one trustworthy post-launch event correlated to the
      exact discovered session; weaker evidence is recorded as a negative
      result and cannot produce `watched` status.
- [x] The result records exact Codex and PackWalk versions, tested mechanism,
      platform/architecture, reproduction steps, observed evidence, and the
      reason the conclusion is supported.
- [ ] A negative result is considered complete, does not block the polling
      product, explicitly records that live watched status and direct control
      remain unavailable, and identifies concrete next options.
- [x] A positive result records evidence only; production `watched` status and
      direct control still require a separate approved implementation decision.
- [x] No qualification harness, Wayfinder campaign, or speculative production
      abstraction is created.
- [x] The report makes no portability claim beyond tested evidence and names
      what would require separate Windows, macOS, and Linux qualification.

## Experiment report

### Environment

- PackWalk package `0.0.0`, fixed integration point
  `e7c7808f4b0ba1b90803634a7f8613beffb96383`.
- Shell-resolved standalone Codex `codex-cli 0.139.0`, binary SHA-256
  `c6ede9ef9b672ef5a99384e507bec5476cbb60934c03f19cbd0355d9fdd83915`.
- macOS `26.5.2` build `25F84`, Darwin `25.5.0`, arm64.
- A separate Codex desktop app-server was `0.145.0-alpha.18`; it was not treated
  as the standalone TUI release under qualification.

### Tested mechanism and evidence

Current experimental TypeScript and JSON app-server schemas were generated in
a disposable directory and removed after inspection. They prove that one
app-server connection can emit notifications with exact `threadId`, `turnId`,
and item identity. They do not expose a request that attaches or subscribes to
another process's independently started ordinary TUI:

- `thread/status/changed`, `turn/started`, and `item/started` carry exact
  structural identifiers;
- notification filtering applies to the current connection;
- `thread/loaded/list` returns sessions loaded in that app-server's memory;
- the request union has no `thread/attach` or `thread/subscribe` method;
- `thread/resume` loads from disk or rejoins a thread already running inside
  that app-server, so it is not a connection-only attachment to another TUI.

The standalone binary identifies separate in-process and remote clients. The
ordinary TUI starts an embedded `InProcessAppServerClient` and forwards its
events internally. The connectable alternatives are a TUI launched with
`--remote`, a separately listening app-server, or a managed app-server daemon
and proxy. Each changes the accepted launch topology or owns separate in-memory
session state and therefore cannot satisfy this ticket after the ordinary TUI
has already started.

A bounded runtime-topology check found no terminal-attached Codex process on
this machine. The desktop app-server used inherited unnamed socket pairs and
exposed no TCP listener or named Unix endpoint attributable to an ordinary
TUI. Codex's SQLite index maps exact thread identity to a persisted rollout
path but contains no PID, terminal, socket, port, endpoint, or event-stream
handle. No private desktop IPC endpoint was probed.

### Current conclusion

Static inspection of the installed standalone release found no app-server
request that attaches or subscribes to another process's independently started
default TUI. The documented external connection modes require a different
launch topology. This evidence does not establish the runtime topology of an
ordinary default TUI that was already running, because no such process was
available during the check.

The runtime conclusion is therefore unavailable. Ticket 02 stays open until a
maintainer starts one ordinary default TUI and the bounded structural snapshot
below determines whether that process exposes any supported endpoint and
whether it can be correlated to the exact session identity. Persisted SQLite
or file-change evidence remains polling evidence and cannot produce `watched`
status. PackWalk must not expose direct control on the strength of static
schemas or binary symbols alone.

### Concrete next options

1. Complete the one human-only default-TUI topology snapshot described above.
2. Keep current sessions truthfully `discovered` or `polled`; do not add
   `watched` status or direct control from this evidence.
3. Ask Codex for a supported, authenticated, read-only post-launch endpoint
   that exposes exact thread identity and structural event subscription without
   resuming or owning the session, then requalify a future installed release.
4. Treat `--remote` or a managed app-server topology as a separate product
   decision rather than a workaround under the current boundary.
5. Qualify Windows and Linux independently before making portability claims.

### Reproduction

```sh
codex --version
codex --help
codex app-server --help
codex app-server daemon --help
codex app-server proxy --help
codex remote-control --help
codex features list | rg 'tui_app_server|remote_control'

schema_dir=$(mktemp -d /tmp/packwalk-ticket02-codex-schema.XXXXXX)
mkdir "$schema_dir/ts" "$schema_dir/json"
codex app-server generate-ts --experimental --out "$schema_dir/ts"
codex app-server generate-json-schema --experimental --out "$schema_dir/json"
rg -n 'thread/(attach|subscribe|resume|loaded/list|unsubscribe)' "$schema_dir"
find "$schema_dir" -depth -delete

codex_binary=$(readlink "$(command -v codex)")
shasum -a 256 "$codex_binary"
nm -nm "$codex_binary" \
  | rg 'InProcessAppServerClient|RemoteAppServerClient|forward_in_process_event|app_server_session'

ps -axo pid=,ppid=,tty=,comm= \
  | awk '$3 != "??" && $4 ~ /codex$/ { print }'
# Replace 12345 with the TUI PID selected from the preceding structural list.
lsof -nP -a -p 12345 -iTCP -sTCP:LISTEN
lsof -nP -a -p 12345 -U
lsof -nP -a -p 12345 -d 0,1,2

node -e 'const { DatabaseSync }=require("node:sqlite"); const db=new DatabaseSync(process.env.HOME+"/.codex/state_5.sqlite",{readOnly:true}); db.exec("PRAGMA query_only=ON"); console.log(db.prepare("SELECT name,type FROM pragma_table_info(?) ORDER BY cid").all("threads")); db.close()'
```

The topology commands are read-only but their raw output can contain private
local paths, terminal names, process identifiers, file descriptors, or socket
paths. Inspect raw output locally and do not paste or retain it. The public
report may record only this allowlist:

- standalone Codex version and binary hash;
- operating system version and architecture;
- whether exactly one terminal-attached Codex process was present;
- whether that process exposed any named Unix or TCP listener;
- whether an endpoint could be correlated to the exact persisted session ID;
- the relevant schema column names and protocol method names; and
- the final supported, unsupported, or unavailable conclusion.

Do not record command arguments, absolute paths, PIDs, terminal names, file
descriptors, raw socket addresses, environment values, SQLite row data, raw
protocol payloads, prompts, responses, diffs, or command output.

Windows and Linux require separate installed-release and runtime-topology
qualification. This macOS result makes no claim about either platform.

## Comments

- 2026-07-20: Claimed on `agent/ticket-02-live-event-experiment` from fixed
  integration point `e7c7808f4b0ba1b90803634a7f8613beffb96383`. The
  experiment will qualify one post-launch event against the installed Codex
  release without changing ordinary session lifecycle. A rigorous negative
  result remains an accepted resolution and will not block Tickets 03–10.
- 2026-07-20: Static protocol inspection found no attach or subscribe request
  in standalone Codex `0.139.0`. Ordinary-TUI runtime topology remains
  unverified, so Ticket 02 is `needs-info`. The exact human-only evidence is
  isolated above; the remaining polling tickets are not blocked.
- 2026-07-20: Review required the report to stop treating static protocol
  evidence as a runtime conclusion, remove an undefined extra status label,
  and document a reproducible, allowlisted topology check. Those
  documentation findings are corrected without changing product behavior.

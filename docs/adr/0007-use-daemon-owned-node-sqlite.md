# Use daemon-owned node:sqlite as durable authority

Status: accepted

SQLite is PackWalk's authoritative durable store, and `node:sqlite` is its sole
in-process runtime driver. This explicitly accepts the required Node API's
bounded maturity risk only inside the storage adapter. All imports,
`DatabaseSync` values, statements, rows, transaction handles, and driver errors
remain private to that implementation; repository services expose Effect-based
domain operations only.

One scoped Effect Layer acquires exactly one daemon-owned `DatabaseSync`
connection and closes it during finalization. The daemon is the sole domain
writer, serializes authoritative commands, decodes every outgoing row with
Effect Schema, and translates driver failures into PackWalk storage errors.
Transaction callbacks are synchronous and bounded: they execute no Effect,
Promise, Codex call, IPC operation, publication, exporter, or other external
side effect.

The database lives in PackWalk's platform-specific local application-data
directory, never on a network filesystem. Every connection explicitly enables
and verifies foreign keys, defensive mode, extension prohibition, busy timeout,
integer behavior, WAL, and `synchronous=FULL`. Authoritative commands that may
write use `BEGIN IMMEDIATE`; read-only queries do not reserve the writer.
Portable, repository-owned migrations are immutable, ordered, checksummed,
forward-only, and transactionally applied. They do not depend on
driver-specific behavior.

An authoritative transition and its projection commit before PackWalk
publishes, notifies, reports success, or permits external dispatch. A Codex call
never occurs inside the authoritative transaction, and every action that may
cause an external effect records its durable pre-dispatch state first. A busy
timeout or uncertain transaction outcome is surfaced and never causes automatic
repetition of an authoritative command.

The database, WAL, and shared-memory sidecars are one live storage unit.
Backups use a SQLite-aware backup or snapshot operation rather than copying only
the live main file. A bounded checkpoint policy must be selected and qualified
before release. No ORM, query builder, Effect SQL package, alternate SQLite
driver, or second runtime store is introduced without a separately demonstrated
need.

Release qualification covers rollback, constraint enforcement, lock
contention, busy-timeout exhaustion, large integers, migration failure, abrupt
process termination, committed-before-dispatch recovery, and every supported
operating-system and architecture artifact. Qualification defects may reopen
the driver decision; general concern about its accepted maturity risk does not.

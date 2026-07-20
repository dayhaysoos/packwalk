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

That same authoritative connection is also daemon writer election. Before any
schema, import, worker, or transport acquisition, it sets
`locking_mode=EXCLUSIVE`, forces lock acquisition with a no-op immediate
transaction, enters WAL, verifies its settings, and retains the resulting file
lock for the Layer scope. A second daemon fails storage acquisition visibly; a
generic busy result is not reclassified as proof that a healthy daemon exists.
The client Unix socket or Windows named pipe is transport and liveness only.

The database lives in PackWalk's platform-specific local application-data
directory, never on a network filesystem. The authoritative connection
explicitly enables and verifies exclusive locking, foreign keys, defensive
mode, extension prohibition, busy timeout, integer behavior, WAL, and
`synchronous=FULL`. Authoritative commands that may write use
`BEGIN IMMEDIATE`; read-only queries do not start an additional write
transaction.
Portable, repository-owned migrations are immutable, ordered, checksummed,
forward-only, and transactionally applied. They do not depend on
driver-specific behavior.

Versioned first-start import occurs only after the current database connection
owns its exclusive lock. The adapter snapshots the still-independent legacy
database, validates and retains that backup, and transactionally populates the
already-open current database. It never renames another main database inode
over the owned path. A crash before import commit leaves a fresh current
database that can retry from the live legacy database; the retained backup
remains separately validated recovery evidence.

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

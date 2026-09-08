# next-taskr

The Rust scheduler for Next.js's repository build. User-facing commands and the
artifact compatibility gate are documented in `packages/next-taskr/README.md`.

Named recipes use transient turbo-tasks inputs. Serial and parallel
recipe requests create dependencies in that graph; ancestry tracking detects
cycles. The scheduler intentionally does not persist the result of a recipe that
can execute arbitrary JavaScript or subprocesses. This also prevents a warm
build from eagerly replaying old side effects across imperative serial barriers.

SWC transformations are separate, persistent turbo-tasks functions keyed by all
the inputs supplied by the worker. Each recipe read action reads fresh file
contents using bounded parallel filesystem workers. Recipes can create or
rewrite inputs through JavaScript or compiler subprocesses between actions;
those reads must observe the new files without waiting for watcher events.
Source bytes stay in Rust behind artifact handles without a base64 round trip.
Transform keys still include the contents, so unchanged inputs reuse cached
results. turbo-tasks-fs tracks watch subscriptions separately; source invalidation
must not reactively replay an earlier recipe's side effects. Output
materialization runs outside the cached transformation, so a cached result can
restore a deleted or damaged file. Write batches are serialized, skip equal
contents, and publish complete files with a rename in the destination directory.
Within a batch, independent outputs use up to eight blocking workers, bounded
by CPU availability and batch size. Each worker reuses created directories.
Batches containing duplicate destination paths stay sequential. Every started
worker finishes before a write error is returned, preserving serial barriers
even on failure. File contents are still compared when outputs already exist;
the runner does not assume a file is valid from timestamps alone.

The Node worker communicates over newline-delimited JSON on stdin/stdout.
Responses use the `__NEXT_TASKR__` prefix. Compiler and subprocess logs use
stderr, leaving stdout exclusively for the protocol. Malformed responses fail
all pending requests instead of leaving an action waiting indefinitely.
Rust sends `task`, `transform`, `list`, and `shutdown` requests with numeric IDs.
The worker can make `tasks`, `read`, `load`, `transform`, `transforms`, `write`, `clear`, and `watch`
callbacks associated with the parent request. Rust replies to each callback
before the requesting recipe continues. With `artifacts: true`, `read` and
`transforms` return handles instead of file contents. Rust retains source and
cached output buffers for the lifetime of that recipe request. `write` resolves
the handles and materializes outputs directly, including cached error artifacts.
Handles are process-unique, cannot be accessed by another recipe, and are resolved
to contents before constructing persistent transform keys. They never enter the
disk cache. Finishing or failing a recipe releases its buffers.

JavaScript plugins that consume file contents request them explicitly with
`load`. Binary contents crossing the process boundary still use base64. A cache
miss sends source contents to SWC and receives emitted contents once; cache hits
and ordinary copies keep those bytes in Rust throughout the recipe pipeline.
The `transforms` callback schedules independent cached computations
concurrently and returns results in input order. A content digest covers shared
compiler inputs, keeping shared configuration out of per-file requests and
cache keys while preserving invalidation when any shared input changes.
The real SWC worker uses batches of at most 32 files as cache entries to amortize
IPC and WASI setup. Its stats count transformed files, not batches.

The backend cache version incorporates the runner binary's SHA-256 digest. The
worker includes its own code, loaded dependencies, native compiler,
package manifests, lockfile, Node version, platform, architecture, checkout path,
and environment in its compiler fingerprint. Environment values are hashed;
they are not logged. Use `--no-cache` to run with an in-memory backend.

Directory snapshots are turbo-tasks computations invalidated by native
filesystem events. The event loop reads strongly consistent snapshots and runs
the relevant recipes when they change. Rspack and TypeScript retain ownership of
their compiler watch services. SIGINT and SIGTERM initiate worker shutdown.

The test worker in `tests/fixtures` exercises the protocol without bootstrapping
Next.js, while `test/unit/next-taskr` checks the real SWC worker and artifact
comparator. Full-pipeline byte comparisons are the acceptance test for emitter
compatibility.

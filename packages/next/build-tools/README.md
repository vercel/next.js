# Rust runner byte emitters

`worker.js` adapts the existing `taskfile.js` recipes to the Rust runner's action
protocol. It loads the existing SWC, NCC, and Rspack plugin implementations without
loading Taskr. The small fluent adapter preserves the file objects and paths those
implementations expect; it delegates scheduling, reads, caching, and writes to
Rust. Configuration changes require a runner restart.

`artifacts.js` keeps file contents in Rust behind recipe-scoped handles. Source
discovery, SWC cache hits, and destination mapping exchange metadata only;
`.target()` asks Rust to write the referenced contents directly. Before invoking
an arbitrary JavaScript plugin or `.run()` callback, the adapter loads its file
contents and replaces each handle with a Buffer. Discarding the handle at that
boundary ensures in-place Buffer mutations and replacement strings are emitted
instead of stale cached bytes. The legacy emitter interface remains unchanged.

`recipes.js` supplies the Rust runner's build dependency graph. After copying
dependencies, file compilation and runtime bundling run alongside TypeScript
declarations. The declaration inputs are source files and vendored dependencies;
they do not require compiled JavaScript. Other named recipes still use the
existing taskfile.

NCC and Rspack plugins load on their first invocation, so SWC-only recipes do
not initialize or fingerprint unused bundlers. The SWC emitter and its loaded
configuration remain included in compiler fingerprints.

The worker reserves stdout for complete protocol messages. JavaScript logs and
both output streams of compiler subprocesses go to stderr, so a TypeScript
startup banner cannot split a large file-transfer message. Malformed protocol
responses fail the build immediately.

`swc-pool.js` starts up to four `swc-worker.js` processes. Each has a private
temporary working directory. A transformation returns every emitted file,
so Rust can replay them on a cache hit. The pool runs one
batch at a time in each process and removes its directories on shutdown.
Each batch contains up to 32 files, executes native transforms concurrently, and
returns their complete outputs and combined error artifacts as one cache entry.
Even when a transform fails, every native call finishes before another batch can
clear the private artifacts. Changing an input invalidates its bounded batch.
The scheduler submits all batches in a recipe together. A SHA-256 digest identifies
the shared compiler fingerprint and options. Small, isolated filesystem
operations are synchronous to avoid a
thread-pool round trip per operation.

`swc-cache.js` seeds each private cwd with copies of SWC's compiled WASM cache.
After a worker finishes successfully, it atomically publishes new immutable
cache entries to the normal package `.swc` directory. Workers never share writable
cache files or error-code artifacts. Cache IO is optional and does not make a
successful transform fail. Compiler fingerprints read files in bounded parallel
groups and hash them in deterministic order.

Canary no longer uses the error-code WASM plugin. The runner does not require
its removed WASM binary or `errors.json` input. The protocol retains support for
replaying auxiliary artifacts; the Rust fixture and adapter tests cover it.
The benchmark reports from the original release checkout retain their historical
inputs and timings, including that plugin.

Keep the existing emitters pinned while validating the Rust runner. Replacing
them with other compiler versions or implementations requires a separate exact
artifact comparison. See `packages/next-taskr/README.md` for the commands and
current compatibility gate.

# wasi-test-host

Runs `wasm32-wasip1-threads` test binaries that link `turbo-tasks`.

## Why this exists

Those binaries compile, but no off-the-shelf WASI runtime can start them:

```
Error: unknown import: `env::read_custom_section` has not been defined
```

`turbo-tasks` gathers its task registries at link time with the `link-section` crate. On wasm there
are no section start/stop symbols, so the crate stores each registry in a **custom section** and
expects the embedder to hand it back through an `env.read_custom_section` import — data the guest
cannot reach on its own. The exact guest/host contract is in the
[`link-section` wasm preamble](https://github.com/mmastrac/linktime/blob/ae29e51d94a955df2442ed6418b8a712c1f2bfb3/link-section/docs/PREAMBLE.md#wasm).
`wasmtime` cannot inject host imports from the CLI (`--preload env=…` does not satisfy core-module
imports), so without a host like this one nothing in the `turbo-tasks` family can be tested on wasm.

The other missing host feature is
[`wasi.thread-spawn`](https://github.com/WebAssembly/wasi-threads). V8 implements shared WebAssembly
memory and atomics, but Node's `WASI#getImportObject()` exposes only `wasi_snapshot_preview1`, not the
proposal's `wasi` namespace. `@emnapi/wasi-threads` bridges that import to Node Workers.

Threads also need one file descriptor table. `node:wasi` keeps its fd table inside each `WASI`
instance, and every thread is a separate instance, so a file opened on one thread would be a bad
descriptor (or a different file) on all the others. The host therefore implements the filesystem
imports itself over a table shared by every thread; see [Files](#files).

The same hook will be needed by the Next.js wasm loader for Turbopack itself, so the
`read_custom_section` implementation here is a first cut of that work rather than test-only
scaffolding.

## Usage

```sh
pnpm install
export CARGO_TARGET_WASM32_WASIP1_THREADS_RUNNER="node scripts/wasi-test-host/run.mjs"
cargo test -p turbo-tasks --lib --target wasm32-wasip1-threads
cargo test -p turbo-tasks-backend --lib --target wasm32-wasip1-threads
```

The host's own tests run without a wasm build:

```sh
node --test scripts/wasi-test-host/*.test.mjs
```

Building for that target also needs a WASI C toolchain, because `lz4-sys` and `zstd-sys` have C build
scripts — see the `test-next-napi-bindings-wasi` job in `.github/workflows/build_and_test.yml` for the
wasi-sdk setup.

## What it provides

| Import                                  | Source                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `wasi_snapshot_preview1.fd_*`, `path_*` | `node:fs` over an fd table shared by all threads (`fs.mjs`)                               |
| `wasi_snapshot_preview1.poll_oneoff`    | clock-only: `node:wasi`; on fds: the shared table (`fs.mjs`)                              |
| other `wasi_snapshot_preview1.*`        | `node:wasi`, one instance per thread                                                      |
| `wasi.thread-spawn`                     | `@emnapi/wasi-threads` over `node:worker_threads` (`spawn.mjs`)                           |
| `env.memory`                            | a shared `WebAssembly.Memory` matching the explicit linker limits in `.cargo/config.toml` |
| `env.read_custom_section`               | `WebAssembly.Module.customSections` (`lib.mjs`)                                           |
| filesystem                              | working directory at `/`; the system `os.tmpdir()` at `/tmp`, also exported as `TMPDIR`   |

`@emnapi/wasi-threads` owns Worker lifecycle, compiled-module transfer, load/start ordering, and
cleanup. A small local adapter remains because Rust imports the original one-argument
`thread-spawn` ABI but does not export the `malloc`/`free` functions the package's high-level wrapper
uses for that ABI.

The imported shared memory uses 8,192 initial pages (512 MiB) and 65,536 maximum pages (4 GiB).
Those values are also explicit `wasm32-wasip1-threads` linker flags in `.cargo/config.toml`; keep the
host constants and linker byte values in sync. A shared WebAssembly memory must declare a maximum,
and 65,536 pages is the wasm32 architectural ceiling.

### `read_custom_section`

A two-phase contract, per the
[`link-section` wasm preamble](https://github.com/mmastrac/linktime/blob/ae29e51d94a955df2442ed6418b8a712c1f2bfb3/link-section/docs/PREAMBLE.md#wasm):

- section not found → return `0`;
- `targetLength` too small → return the required size and copy nothing;
- otherwise → copy into guest memory and return the number of bytes.

Returning `0` unconditionally is not a shortcut: the registries then come up empty. `link-section`'s
pre-main constructor notices and aborts, which is at least loud, but the correct sections are what
make the module usable. `registry::tests::registries_are_populated` guards this from the Rust side.

### Temporary files

WASI preview1's `std::env::temp_dir()` is unsupported, so Rust tests cannot use
`tempfile::tempdir()` directly. The runner pre-opens the system's actual temporary directory as
`/tmp` for the whole process (see [Files](#files)), and exports that guest path through `TMPDIR`.
`turbo-tasks-backend`'s `test_temp_dir()` helper reads it explicitly, keeping fixtures out of the
checkout and Cargo `target` tree.

### Files

Rust programs pass open files between threads all the time: Tokio tasks move between workers, and
`turbo-persistence` creates, syncs and reads files from parallel helper jobs. With `node:wasi`'s
per-instance fd table, that fails (`Bad file descriptor`) or, worse, an fd number names a different
file on another thread.

Host OS fds, unlike that table, are process-wide across Workers. So `fs.mjs` implements the `fd_*`
and `path_*` imports on synchronous `node:fs` calls, and keeps the guest fd table — host fd, file
type, flags, rights, offset, and for directories their host path — in a `SharedArrayBuffer` that
every thread maps:

- **I/O stays concurrent.** Each call runs on the calling thread. Only fd allocation, `fd_close` and
  `fd_renumber` take a short lock on the table, never across a syscall, and lookups are lock-free
  (a per-entry sequence counter makes sure a lookup never sees half of a replaced entry). A thread
  blocked in a read does not hold up file I/O on any other thread.
- **fds belong to the process, not the thread.** The main thread opens stdio and the preopens once.
  Workers are created with `trackUnmanagedFds: false`, so a thread exiting does not close host fds
  that other threads still use; a guest fd stays valid until the guest closes it.
- **The file offset is shared** across threads, like a real fd's. Node has no `lseek`, so the offset
  of a seekable fd lives in the table, and the calls that use it (`fd_read`, `fd_write`, `fd_seek`,
  `fd_tell`) hold that fd's own I/O lock across their syscall. Concurrent reads or writes through one
  fd therefore never see the same bytes twice or overwrite each other. The lock is per fd: other
  fds, positioned I/O (`fd_pread`/`fd_pwrite`, which `turbo-persistence` uses for SST reads),
  syncs, stats, path calls and non-seekable fds (pipes, FIFOs, stdio) never wait for it.
- **Paths stay inside the directory fd.** Components resolve in order, like the OS, so `link/..` is
  the parent of the link's target. Absolute paths, `..` above the base, and symlinks (in any
  component) that lead out of it fail with `ENOTCAPABLE`. A directory fd resolves through its host
  path, so it remembers the directory's `dev`/`ino` and fails with `ENOENT` once that path names
  something else, such as after a rename. Resolution is not atomic with the syscall that follows; this
  is a test host, not a sandbox.
- **What `node:fs` cannot do is an errno, not a fallback.** Rights are reported but not enforced, so
  `fd_fdstat_set_rights` only accepts the current rights. `fd_fdstat_set_flags` only accepts the
  current flags. `fd_allocate` cannot reserve space, and offsets beyond `Number.MAX_SAFE_INTEGER` are
  rejected rather than rounded. All of these return `ENOTSUP`, `EINVAL` or `EOVERFLOW`. `poll_oneoff`
  reports regular files and directories as ready and other fd types as `ENOTSUP`. Nothing falls back
  to `node:wasi`'s private table.

`fs.test.mjs` covers these properties, including:

- a thread blocked on a FIFO read not stopping another from opening, writing, syncing and closing a
  file;
- several threads reading or writing records through one fd;
- lookups racing `fd_close`/`fd_renumber`.

### Threads

Each thread is a Worker running the same module over the same shared memory, entered through the
module's `wasi_thread_start` export. Three details are worth knowing:

- **The module is compiled once.** `@emnapi/wasi-threads` sends the compiled, structured-cloneable
  `WebAssembly.Module` to Workers. Each Worker instantiates it over the shared memory; it does not
  recompile the Turbopack binary.
- **Workers spawn workers directly.** A Tokio multi-thread runtime spawns threads from its worker
  threads, and the main thread is usually parked in `Atomics.wait` inside wasm, so it cannot service
  a request to spawn on someone else's behalf. Thread ids come from one `Atomics.add` counter in
  shared memory so they stay unique across all of them.
- **`wasi.initialize()` refuses a module exporting `_start`**, since that marks a command whose
  `_start` must run exactly once, on the main thread. A spawned thread hides that export to get the
  WASI binding, then calls `wasi_thread_start` itself.

## Tests that cannot run on wasm

Some tests are marked `#[cfg_attr(target_family = "wasm", ignore = "…")]`, so they show up as
`ignored, <reason>` rather than disappearing. Each reason is a real platform limitation, not a
workaround for this host:

| Reason                             | Why                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no unwinding on wasm`             | wasm is `panic = abort`, so `catch_unwind` never catches and a panic takes the whole instance down. Affects `#[should_panic]` tests and tests asserting panic isolation.                                                          |
| `parking_lot cannot block on wasm` | `parking_lot_core` only has a working thread parker behind its `nightly` feature, and the pinned version cannot compile it on current nightly. Blocking on a contended lock panics with "Parking not supported on this platform". |

The `parking_lot` limitation is worth calling out: it is not only a test problem. Until it is fixed,
any contended lock panics on wasm, which Turbopack itself would hit. The no-unwinding limitation is
similar — `turbo-tasks` uses `catch_unwind` in production to keep a panicking task from taking down
the process, and that protection is inert on wasm.

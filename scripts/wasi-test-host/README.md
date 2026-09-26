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

Building for that target also needs a WASI C toolchain, because `lz4-sys` and `zstd-sys` have C build
scripts — see the `test-next-napi-bindings-wasi` job in `.github/workflows/build_and_test.yml` for the
wasi-sdk setup.

## What it provides

| Import | Source |
|---|---|
| `wasi_snapshot_preview1.*` | `node:wasi` |
| `wasi.thread-spawn` | `@emnapi/wasi-threads` over `node:worker_threads` (`spawn.mjs`) |
| `env.memory` | a shared `WebAssembly.Memory` matching the explicit linker limits in `.cargo/config.toml` |
| `env.read_custom_section` | `WebAssembly.Module.customSections` (`lib.mjs`) |
| filesystem | working directory at `/`; the system `os.tmpdir()` at `/tmp`, also exported as `TMPDIR` |

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
`/tmp` for the main instance and every pthread, and exports that guest path through `TMPDIR`.
`turbo-tasks-backend`'s `test_temp_dir()` helper reads it explicitly, keeping fixtures out of the
checkout and Cargo `target` tree.

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

| Reason | Why |
|---|---|
| `no unwinding on wasm` | wasm is `panic = abort`, so `catch_unwind` never catches and a panic takes the whole instance down. Affects `#[should_panic]` tests and tests asserting panic isolation. |
| `parking_lot cannot block on wasm` | `parking_lot_core` only has a working thread parker behind its `nightly` feature, and the pinned version cannot compile it on current nightly. Blocking on a contended lock panics with "Parking not supported on this platform". |

The `parking_lot` limitation is worth calling out: it is not only a test problem. Until it is fixed,
any contended lock panics on wasm, which Turbopack itself would hit. The no-unwinding limitation is
similar — `turbo-tasks` uses `catch_unwind` in production to keep a panicking task from taking down
the process, and that protection is inert on wasm.

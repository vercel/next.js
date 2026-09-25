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

The Next.js production loader needs the same hooks. Their single implementation now lives in
`packages/next/src/build/swc/wasi-runtime.ts`; this runner imports the compiled copy instead of
maintaining test-only versions that could drift.

## Usage

```sh
pnpm install
pnpm --filter next build
export CARGO_TARGET_WASM32_WASIP1_THREADS_RUNNER="node scripts/wasi-test-host/run.mjs"
cargo test -p turbo-tasks --lib --target wasm32-wasip1-threads
cargo test -p turbo-tasks-backend --lib --target wasm32-wasip1-threads
```

Building for that target also needs a WASI C toolchain, because `lz4-sys` and `zstd-sys` have C build
scripts — see the `test-next-napi-bindings-wasi` job in `.github/workflows/build_and_test.yml` for the
wasi-sdk setup.

Its own tests run against the same compiled production support:

```sh
node --test packages/next/src/build/swc/wasi-loader.test.mjs
source scripts/setup-wasi-env.sh
cargo build -p next-napi-bindings --target wasm32-wasip1-threads
node scripts/wasi-test-host/napi-async-smoke.mjs
node scripts/wasi-test-host/next-build-smoke.mjs
```

The async smoke uses the full emnapi runtime installed by `setup-wasi-env.sh`. It proves real
`projectNew` and `projectShutdown` promises complete across pthread Workers; the lower-crate Cargo
runner does not provide N-API imports and cannot run `next-napi-bindings` test artifacts directly.
It materializes the built `next` package in its temporary project: on Node 20.9, the WASI resolver
cannot follow the workspace's symlinked `node_modules/next`, which would prevent the error-path
smoke from reaching its intentionally invalid Sass configuration.
The build smoke invokes the normal `next build --wasi` CLI with a TypeScript config and proves the
parent plus every build worker selected WASI without creating persistent cache files. Its temporary
project materializes the built `next` package and its compile-time dependencies rather than relying
on symlinks the Node 20.9 WASI filesystem resolver cannot traverse. Its CLI runs from the same copy
that the project builds against, so Node workers share the expected package module identity.

(Pass the file. `node --test <dir>` tries to resolve the directory as a module and fails.)

## What it provides

| Import | Source |
|---|---|
| `wasi_snapshot_preview1.*` | `node:wasi` |
| `wasi.thread-spawn` | `@emnapi/wasi-threads` over `node:worker_threads` |
| `env.memory` | shared `WebAssembly.Memory` created by `packages/next/dist/build/swc/wasi-runtime.js` |
| `env.read_custom_section` | `WebAssembly.Module.customSections`, from the same shared runtime |
| filesystem | working directory at `/`; the system `os.tmpdir()` at `/tmp`, also exported as `TMPDIR` |

`@emnapi/wasi-threads` owns Worker lifecycle, compiled-module transfer, load/start ordering, and
cleanup. A small local adapter remains because Rust imports the original one-argument
`thread-spawn` ABI but does not export the `malloc`/`free` functions the package's high-level wrapper
uses for that ABI. Every pthread Worker is registered with the main emnapi N-API instance before it
loads; async-work and thread-safe-function completions otherwise never reach the JavaScript Promise.

The imported shared memory uses 8,192 initial pages (512 MiB) and 65,536 maximum pages (4 GiB).
Those values are also explicit `wasm32-wasip1-threads` linker flags in `.cargo/config.toml`; keep the
shared runtime constants and linker byte values in sync. A shared WebAssembly memory must declare a
maximum, and 65,536 pages is the wasm32 architectural ceiling.

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
  WASI binding; `ThreadMessageHandler` then calls `wasi_thread_start`.

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

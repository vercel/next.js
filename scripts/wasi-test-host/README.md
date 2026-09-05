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
cannot reach on its own. `wasmtime` cannot inject host imports from the CLI (`--preload env=…` does
not satisfy core-module imports), so without a host like this one nothing in the `turbo-tasks` family
can be tested on wasm at all.

The same hook will be needed by the Next.js wasm loader for Turbopack itself, so the
`read_custom_section` implementation here is a first cut of that work rather than test-only
scaffolding.

## Usage

```sh
export CARGO_TARGET_WASM32_WASIP1_THREADS_RUNNER="node scripts/wasi-test-host/run.mjs"
cargo test -p turbo-tasks --lib --target wasm32-wasip1-threads
cargo test -p turbo-tasks-backend --lib --target wasm32-wasip1-threads
```

Building for that target also needs a WASI C toolchain, because `lzzzz` (LZ4) and `zstd-sys` have C
build scripts — see the `test-next-napi-bindings-wasi` job in `.github/workflows/build_and_test.yml`
for the wasi-sdk setup.

Its own tests:

```sh
node --test scripts/wasi-test-host/lib.test.mjs
```

(Pass the file. `node --test <dir>` tries to resolve the directory as a module and fails.)

## What it provides

| Import | Source |
|---|---|
| `wasi_snapshot_preview1.*` | `node:wasi` |
| `wasi.thread-spawn` | `node:worker_threads` (`spawn.mjs`) |
| `env.memory` | a shared `WebAssembly.Memory` created from limits parsed out of the binary |
| `env.read_custom_section` | `WebAssembly.Module.customSections` (`lib.mjs`) |

It is deliberately **dependency-free** — only Node built-ins. The CI job that uses it runs with
`skipInstallBuild`, so `node_modules` does not exist there.

### `read_custom_section`

A two-phase contract, per `link-section`'s `docs/PREAMBLE.md`:

- section not found → return `0`;
- `targetLength` too small → return the required size and copy nothing;
- otherwise → copy into guest memory and return the number of bytes.

Returning `0` unconditionally is not a shortcut: the registries then come up empty. `link-section`'s
pre-main constructor notices and aborts, which is at least loud, but the correct sections are what
make the module usable. `registry::tests::registries_are_populated` guards this from the Rust side.

### Threads

Each thread is a Worker running the same module over the same shared memory, entered through the
module's `wasi_thread_start` export. Two details worth knowing:

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
| `no temp directory on WASI` | `std::env::temp_dir()` is unsupported on WASI preview1, so anything using `TempDir` panics. |

The `parking_lot` limitation is worth calling out: it is not only a test problem. Until it is fixed,
any contended lock panics on wasm, which Turbopack itself would hit. The no-unwinding limitation is
similar — `turbo-tasks` uses `catch_unwind` in production to keep a panicking task from taking down
the process, and that protection is inert on wasm.

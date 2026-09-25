# Building Turbopack for WebAssembly

Turbopack's napi bindings (`crates/next-napi-bindings`) can be compiled for
`wasm32-wasip1-threads`. Next.js publishes that architecture-independent build as
`@next/swc-wasm-wasi` for the experimental `next build --wasi` command.

> This is distinct from the `@next/swc-wasm-*` packages, which are built with `wasm-pack` from
> `crates/wasm` for `wasm32-unknown-unknown` and contain SWC only, not Turbopack.

## Prerequisites

Beyond the usual Rust toolchain, the target needs a WASI clang and sysroot (several dependencies have
C build scripts) and emnapi (napi's build script links against it). `scripts/setup-wasi-env.sh`
provisions both.

## Building on Linux

The setup script supports Linux systems directly. Use the package build for the stripped release
artifact that Next.js consumes:

```sh
scripts/build-next-swc-wasi.sh
```

For a faster development build, source the environment and invoke Cargo directly:

```sh
source scripts/setup-wasi-env.sh
cargo build -p next-napi-bindings --target wasm32-wasip1-threads
```

It must be sourced from **Bash** because it uses `BASH_SOURCE`; alternative shells such as zsh should
invoke Bash explicitly:

```sh
bash -c 'source scripts/setup-wasi-env.sh && cargo build -p next-napi-bindings --target wasm32-wasip1-threads'
```

The script exports environment variables into the calling shell, which a subprocess cannot do.
Running it directly prints an error and does nothing.

The script downloads the wasi-sdk matching your host architecture, verifies it against a pinned
sha256, installs exact compatible emnapi linker/runtime versions, and exports the cross-compilation
variables (`WASI_SDK_PATH`, `EMNAPI_NODE_MODULES`, `EMNAPI_LINK_DIR`, and the
`*_wasm32_wasip1_threads` compiler variables). Downloads are cached under
`~/.cache/next-wasi-toolchain`, so re-sourcing in a new shell is fast. Set `WASI_SETUP_CACHE_DIR` to
move the cache.

CI sources the same script, so local and CI builds cannot drift apart. `next build --wasi` defaults
the multi-threaded Tokio runtime to two workers; set `TURBO_TASKS_AVAILABLE_PARALLELISM` before
invoking Next to override it for diagnostics.

## Building with Docker

On macOS, Windows, or any other Docker-capable host, use the Linux builder image:

```sh
docker build -t next-wasi-builder -f scripts/wasi-builder.Dockerfile .
docker run --rm -it \
  -v "$PWD:/workspace" \
  -v next-wasi-cache:/root/.cache/next-wasi-toolchain \
  -w /workspace \
  next-wasi-builder
```

Inside the container, use the same package build as CI:

```sh
scripts/build-next-swc-wasi.sh
```

The named volume preserves the wasi-sdk and emnapi downloads between runs. Mount a second volume at
`/workspace/target` if you also want to preserve Rust build artifacts without writing them to the host
checkout.

## Running tests

Wasm test binaries cannot be run directly: `turbo-tasks` gathers its task registries at link time and
needs the embedder to supply an `env.read_custom_section` import. `scripts/wasi-test-host/` is a Node
host that provides it, along with WASI preview1 and thread spawning.

Sourcing the setup script points Cargo's runner at that host, so tests work with the normal command:

```sh
source scripts/setup-wasi-env.sh
cargo test -p turbo-tasks --lib --target wasm32-wasip1-threads
```

Some tests are skipped on wasm; each carries a reason describing the specific platform limitation
(no unwinding, no mmap, and so on).

### Linting

Use `--lib --tests` rather than `--all-targets` when running clippy for wasm. `--all-targets` includes
benchmark targets, which depend on `criterion` (and so rayon) and cannot build for WASI:

```sh
cargo clippy -p turbo-tasks --lib --tests --target wasm32-wasip1-threads -- -D warnings
```

## Running a Next.js build

The CLI downloads the matching `@next/swc-wasm-wasi` version on demand and caches it with the other
SWC packages:

```sh
next build --wasi
```

This trusted build module receives host root as guest `/` so absolute project, workspace, package,
and cache paths preserve their native meaning. This is not a security sandbox.

## Known limitations

- **emnapi v2 is a prerelease.** `napi-build` needs the `emnapi_create_env` / `emnapi_delete_env`
  exports, which exist only in v2, so the package build pins `emnapi@2.0.0-alpha.4`. Move to the
  stable release once it ships.
- Only the default Turbopack production `next build` is supported. Development/HMR, Webpack builds,
  Jest, and analyze commands do not expose a WASI mode yet.
- Turbopack filesystem persistence is disabled. WASI file descriptors belong to one pthread module
  instance and cannot safely move to another instance during parallel persistence commits.
- Features unavailable on WASI report actionable errors: SWC wasm plugins, HTTP fetches such as
  `next/font/google`, trace-server sockets, and the child-process plugin pool.

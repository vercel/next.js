# Next.js Rust build runner

`@next/taskr` launches the `next-taskr` Rust binary. The binary uses turbo-tasks
to run the existing Next.js build recipes and cache SWC transformations. It does
not load Taskr or its runtime. Node.js runs the existing byte emitters so their
compiler versions, options, source maps, and generated files stay compatible.

## Commands

From the repository root, after the normal workspace bootstrap:

```sh
pnpm --filter=next build:rust
pnpm --filter=next dev:rust
pnpm --filter=next ncc-compiled:rust

# Run an individual recipe, list recipes, or bypass the persistent cache.
node packages/next-taskr/bin/next-taskr.js --cwd packages/next bin --stats
node packages/next-taskr/bin/next-taskr.js --cwd packages/next --list
node packages/next-taskr/bin/next-taskr.js --cwd packages/next release --no-cache
```

The source launcher runs `cargo build -p next-taskr --release` to check binary freshness.
This requires the repository's Rust toolchain, but does not depend on an existing
`next/dist` or locally built Next.js native binding.

To prepare a platform-specific binary:

```sh
pnpm --filter=@next/taskr build:runner
```

The launcher prefers the resulting `dist/<platform>-<arch>/next-taskr` binary.
Rebuild it after changing Rust sources. Set `NEXT_TASKR_BINARY` to supply a binary
explicitly, including in environments without Cargo. The package is private;
platform binary publication is not configured.

## Artifact compatibility

`build`, `dev`, and `ncc-compiled` still select Taskr. The Rust runner is available
through the commands above while platform validation and default cutover are
outstanding.

The vendoring comparison passes for all 997 generated files. Release comparisons
found an existing Rspack nondeterminism affecting next-server runtime bundles and
their source maps.

An external module's ID can use either `../lib/trace/tracer` or `./lib/trace/tracer`.
This also occurs between unchanged Taskr builds and has been reported upstream.
The strict comparator does not ignore differences or normalize artifact bytes.
The benchmark harness accepts only this reported ID spelling difference and its
corresponding source-map column shifts; it checks every other artifact byte.

Run both builders at the **same absolute checkout path**, with the same inputs,
dependency installation, Node version, and environment. Separate worktrees can
change emitted source maps. Wait for each build to finish before snapshotting.

```sh
pnpm --filter=next exec taskr release
node scripts/taskr-parity.js snapshot packages/next/dist /tmp/taskr-reference-dist
pnpm --filter=next build:rust
node scripts/taskr-parity.js compare /tmp/taskr-reference-dist packages/next/dist
```

The snapshot destination must not already exist. The comparator checks raw file
bytes, missing and extra entries, empty directories, symbolic link targets, and
executable bits. `--strict-modes` additionally compares every permission bit.
Legacy WASI transforms can race with the process umask, so ordinary write bits
are reported separately from the artifact byte contract.

Vendoring recipes modify both `src/compiled` and some installed dependencies.
For an equivalent vendoring comparison, restore those dependency inputs before
each run and restore the original checked-in tree afterward. Do not run either
builder concurrently with a watch process that writes the same outputs.

## Cache and watch behavior

The persistent cache lives in `packages/next/.cache/next-taskr`. Cached SWC results
include source bytes, logical paths, options, and the compiler fingerprint.
They include every emitted file, including JavaScript and source maps.
Removing or corrupting an output does not make it a valid cache hit:
each recipe materializes its results again. Unchanged files are not rewritten.
Source and cached output contents stay in Rust. Node recipes carry artifact
handles through to destination mapping; only JavaScript plugins and callbacks
that receive file contents load them into Node Buffers. Handles are released
when their recipe finishes and are never persisted in cache keys.

Custom JavaScript, NCC, Rspack, and TypeScript actions run on every invocation;
their undeclared filesystem effects are not persisted as cacheable results.
The Rust build recipe overlaps JavaScript compilation and runtime bundling with
declaration generation after dependency copies complete. SWC requests execute in batches;
shared compiler inputs travel by content digest instead of being repeated per
file. Output materialization uses bounded parallel filesystem workers with atomic
writes, preserving ordering between recipe batches and duplicate destinations.
Watch mode uses turbo-tasks-fs for source changes and retains Rspack and TypeScript
watch services. It follows source symlinks, reconciles edits during startup, and
continues after a source build error. Restart the runner after changing build
recipes, plugins, dependencies, the lockfile, or environment variables.

## Verification

The [local release benchmark](./benchmarks/2026-09-07-optimized.md) records paired
Taskr comparisons, output verification, and the performance changes.
The [artifact-handle comparison](./benchmarks/2026-09-08-artifact-handles.md)
measures isolated JavaScript compilation and traffic between Rust and Node.
The [parallel materialization comparison](./benchmarks/2026-09-08-materialization.md)
profiles remaining work and measures builds with deleted or retained outputs.

```sh
cargo test -p next-taskr
cargo clippy -p next-taskr --all-targets -- -D warnings
pnpm exec jest --runTestsByPath test/unit/next-taskr/parity.test.ts test/unit/next-taskr/swc.test.ts --runInBand
```

Rust integration tests execute the real runner with a small worker fixture. They
cover persisted transforms, duplicate work, deleted and corrupted outputs, input
changes, unexpected worker exits, task cycles, missing inputs, watch recovery,
and symlinks.
Watch tests require native filesystem events to reach the test process.

Before default cutover, also run strict release and vendoring comparisons on the
supported host platforms, compare warm and cold builds, run the existing Next.js
runtime tests, and provide the platform binaries required by CI and contributors.

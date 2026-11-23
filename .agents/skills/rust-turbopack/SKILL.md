---
name: rust-turbopack
description: >
  Build, test, verify, and benchmark Rust changes in the Next.js repository,
  including Turbopack crates and next-napi-bindings. Use for native-binding
  rebuilds before e2e tests, clippy or Miri, Turbopack snapshot and execution
  fixtures, UPDATE=1 snapshot refreshes, fixture discovery, analyzer graph
  snapshots, wasi test failures, worktree target
  directory mistakes, Rust disk usage, TURBO_ENGINE_IGNORE_DIRTY, persistent
  cache benchmarks, RSS measurements, or Criterion runs.
metadata:
  internal: true
---

# Rust and Turbopack

Use this skill when changing or verifying Rust code. Code-level `turbo_tasks`
rules live in `turbopack/AGENTS.md`. Benchmark guidance is in
[benchmarking.md](./benchmarking.md).

## Rebuild before Next.js tests

Next.js e2e tests use the compiled native binding, not Rust source. After a
Rust change, rebuild before running Next.js tests, even when `cargo check`
passes:

```bash
(cd packages/next-swc && CARGO_PROFILE_DEV_DEBUG=0 pnpm build-native)
pnpm build-all
```

- The first command is a faster debug native build. The second matches the
  normal full JS and Rust build.
- Check that the test uses the binding you built. The test harness logs
  `swcNativeDirectory`.
- A debug native build can make build-heavy tests slower than CI.
- Native builds can update
  `packages/next/src/build/swc/generated-native.d.ts`. Commit only intended
  changes.
- `@napi-rs/cli` is a dependency of `packages/next-swc`. Run it through
  `pnpm --filter @next/swc exec napi ...`, and pass `--cwd` as an absolute path.

## Run CI-equivalent checks

- Format with `cargo fmt --all`, then gate with `cargo fmt --all -- --check`.
  Re-run formatting after the last edit, including mechanical renames.
- CI clippy uses warnings as errors. The `packages/next-swc` script is:
  `cargo clippy --workspace --all-targets -- -D warnings -A deprecated`.
  For a focused check, also run clippy for affected dependents with
  `--all-targets`.
- `turbopack` depends on `turbopack-node` without default features. For a
  standalone `cargo check -p turbopack`, enable
  `--features turbopack-node/process_pool`.
- CI runs Miri on a fixed package allowlist with specific flags. Run it with
  `pnpm --filter @next/swc run test-cargo-unit-miri` (see `packages/next-swc/package.json`)
  from the checkout so `rust-toolchain.toml` selects the pinned nightly. A bare
  `cargo miri test -p <crate>` omits those flags and can abort on filesystem
  access. Add a crate to the allowlist only after confirming it runs under Miri.
- Cargo commands can update `Cargo.lock`. Check `git status` and revert
  unrelated changes.
- For an internal compiler error related to incremental compilation, delete the
  affected `*/incremental` directories in the target directory and retry.

## Turbopack fixtures

- Refresh snapshot tests with `UPDATE=1 cargo nextest run -E 'test(snapshot)'`,
  as documented in `turbopack/crates/turbopack-tests/README.md`. Without
  nextest, use
  `UPDATE=1 cargo test -p turbopack-tests --test snapshot <filter>`.
  Then run again without `UPDATE` and review the diff.
- Snapshot `output/` files are tracked. Execution-test `output/` directories
  are ignored. Use a snapshot fixture when exact generated code matters.
- Fixture tests are generated from directory globs at compile time. After adding
  or deleting a fixture directory, touch the relevant harness (for example
  `tests/snapshot.rs`, `tests/execution.rs`, or
  `turbopack-ecmascript/src/references/tests.rs`) so Cargo rebuilds it.
- Execution fixtures enable scope hoisting by default. Add a
  `"scopeHoisting": false` fixture when testing generated cross-module code.
- Prettier can rewrite syntax-sensitive fixture input. Use `// prettier-ignore`
  when the exact syntax is what the test checks.
- Snapshot tests embed the workspace root at compile time
  (`TURBO_PNPM_WORKSPACE_DIR` in `.cargo/config.toml`). Run them from the
  checkout that built the test binary.
- Analyzer graph snapshots include `Effect` debug output. After changing it,
  run `UPDATE=1 cargo test -p turbopack-ecmascript --lib analyzer::tests` and
  check that the snapshot diff contains only the intended change.

## wasi tests

Use `scripts/wasi-test-host/README.md` for host setup and commands.

- The `test next-swc wasi` job runs Rust tests on a target that aborts on panic.
  A failing assertion can stop the whole test binary. Tests that require
  unwinding need a wasm-specific ignore, like existing examples.
- A contended `parking_lot` lock panics on wasm. Tests that need blocking locks
  must account for that platform limitation.

## Target directories

- Don't share one `CARGO_TARGET_DIR` between worktrees. Cargo can reuse a
  workspace crate built from another worktree and test the wrong source. Use
  one target directory per worktree.
- Rust targets can become very large. Check free disk space before broad builds.
  `target/debug/incremental` is disposable when it causes disk pressure.
- For a test binary, use the executable path printed by
  `cargo test --no-run`.
- Rust's test harness hides output from passing tests. Pass `-- --nocapture`
  when you need instrumentation output.
- Parallel copies of tests that use a persistent cache need separate cache or
  target directories.

## Related Skills

- `$pr-status-triage` - CI failure triage
- `$sandbox-bench` - end-to-end render-pipeline A/B benchmarks

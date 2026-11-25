# Benchmarking Turbopack and `next build`

Use this when measuring compile time, persistence, or memory of `next build` /
`next dev` with locally built native bindings (for example on the `bench/`
apps such as `bench/large-app-router` or
`bench/nested-deps-app-router-many-pages`), or when running Criterion benches
in Turbopack crates. For render-pipeline throughput, see
`bench/BENCHMARKING.md` and `$sandbox-bench`.

## Build the arms correctly

- **A native binding built from a dirty git tree disables the Turbopack
  persistent cache.** `next build` prints
  `WARNING: The git repository is dirty: File System Cache is disabled`, so
  "warm" builds behave like cold ones. Commit locally before building, or set
  `TURBO_ENGINE_IGNORE_DIRTY=1` for every arm
  (`turbo-tasks-backend/src/database/db_versioning.rs`). Use the same env for
  base and candidate.
- Build release bindings (`pnpm build-native-release` in `packages/next-swc`)
  for both arms from the exact base and head SHAs. Record the SHA from the build
  log.
- Build the baseline in **its own worktree**
  (`git worktree add <dir> <base-sha>`), never in the checkout you're editing:
  cargo compiles whatever is on disk at that moment. Don't share
  `CARGO_TARGET_DIR` between worktrees (see [SKILL.md](./SKILL.md)). Check
  that the arm binaries actually differ (hash them).
- Per arm, swap **both** `packages/next/dist` and
  `packages/next-swc/native/*.node`, and rebuild `dist` after rebasing so JS
  matches the bindings. A base worktree needs its own `react` / `react-dom`.
- **Keep a separate `.next` per arm.** Persistent cache data from another native
  binary can be incompatible. Prime each arm with one cold and one warm build.
- If a swap script moves binaries between the repo and parked copies, check
  which arm is active before replacing a file, and verify with a marker (for
  example a new span name in the `.node`).

## Run

- Size the workload small first (for example a generated app that compiles in
  a few seconds), then scale up.
- Interleave arms (ABBA) in one contiguous batch, discard a warm-up per arm,
  and run pairs in both orders. Whichever binary runs second often looks
  slower. Keep other cargo/rustc work off the machine during a batch, and record
  the CPU model, since the host can change between batches.
- Don't run cargo builds while a Criterion benchmark is running.
- With SMT, "N CPUs" scaling runs should pin one logical CPU per physical core
  (`taskset` on Linux), together with `TURBO_TASKS_AVAILABLE_PARALLELISM`.
- Large `.next` caches take several GB per arm. Check free disk before each
  build.

## Measure memory correctly

- For `next dev` the large process is the forked server, not the CLI parent.
  Report the launched process, the largest process, and the whole process tree
  separately.
- On Linux:
  - `wait4()` / `ru_maxrss` is the peak of the single largest process in the
    waited tree, not the main process and not the tree total. It is KiB.
  - Poll `VmHWM` in `/proc/<pid>/status` for one process. For the tree, sample
    the sum of `VmRSS` or read cgroup `memory.peak`.
- On macOS, `ru_maxrss` is in bytes, and `/proc` and cgroups don't exist.
- `.next/trace` has thousands of events. Aggregate the direct children of
  `next-build` (for example `turbopack-module-graph`,
  `turbopack-write-entrypoints`, `turbopack-persistence`, `static-generation`)
  instead of printing everything.

## Criterion

- The name filter only skips `bench_function` closures. Setup in the
  surrounding function runs for every filter, so move untimed setup into the
  closure (for example via `OnceCell`).
- `--save-baseline NAME` still overwrites `target/criterion/<id>/new/`. Back up
  `target/criterion` before exploratory runs that could clobber reported
  results.
- To resume an interrupted run, count completed IDs from
  `target/criterion/**/new/estimates.json`, not from `time:` log lines.
- With linear sampling, the reported center is a linear-regression estimate,
  not a mean.
- `cargo run -q 2>&1 | tee out.csv` mixes compiler warnings into the data.
  Redirect only stdout to data files.

## Report

- Compute statistics from the raw per-run data with a script, not from rounded
  console output. Re-measure after refactors before quoting numbers in a PR.
- Report directional estimates with uncertainty. A non-significant result is
  "no detected difference", not proof of equivalence. Keep order-sensitive
  results in the report as a warning, and check every row before claiming "no
  regressions".
- Don't compare timings across machines (local x86 against CI ARM) as if
  paired.

# Parallel output materialization — 2026-09-08

Bounded parallel output writes and lazy bundler loading reduce warm compilation
time by **28.0%** relative to the artifact-handle implementation, using paired
geometric means. This measures `next_compile` alone, with TypeScript and Rspack
excluded from the timed work.

| Case                        | Before median | After median | Paired time reduction |
| --------------------------- | ------------: | -----------: | --------------------: |
| Cold transforms, empty dist |        1.95 s |       1.91 s |                  5.0% |
| Warm transforms, empty dist |        1.42 s |       1.01 s |                 28.0% |
| Warm transforms, kept dist  |        0.94 s |       0.93 s |                  3.5% |

Taskr's median in this series was 1.98 s, with `dist` emptied before each run.
The principal gain is restoring deleted outputs. Builds with existing outputs
remain around 0.93 seconds. These are fresh paired measurements; absolute times
should not be compared directly with earlier benchmark sessions.

Exploratory 95% paired bootstrap intervals, using 10,000 resamples of seven
blocks, are 1.0–8.9% less time cold, 27.2–28.9% less time warm with an empty
output directory, and 0.4–5.9% less time with existing outputs. These intervals
do not remove shared-host contention. Paired reductions are not ratios of the
marginal medians.

## What the profile showed

An instrumented run of the previous implementation took 1.44 s with cached
transforms and empty outputs. Its serialized output-validation/write batches
occupied 1.03 s. Preparing serialized transform keys and parsing/decoding cached
results accounted for about 43 ms; compiler fingerprinting took 87 ms and Node
worker initialization took 147 ms. Some work overlaps, so these measurements
should not be added together as a complete timeline.

With existing outputs, the profiled invocation took 1.02 s, with 0.62 s in output
validation. This identified filesystem work as the largest target. The temporary
profiling instrumentation was removed before the benchmark.

## Changes

- Each output batch uses up to eight blocking workers, bounded by CPU
  availability and file count. Small batches use fewer workers.
- The outer recipe write lock remains held until the whole batch completes.
  Batches with duplicate destination paths remain sequential. Every started
  worker finishes before an error is returned, preventing writes from leaking
  past a failed recipe into later cleanup or consumption steps.
- Equal contents still skip writes. Changed outputs still use temporary files
  and atomic renames, preserving existing permission behavior. Correctness does
  not depend on file timestamps indicating whether contents changed.
- The Node adapter loads NCC and Rspack plugins on their first invocation.
  SWC-only recipes avoid initializing those unused tools and hashing their
  loaded dependencies. The SWC emitter and its configuration remain tracked.

This change keeps the existing Rust cache representation. The profile did not
identify its JSON/base64 processing as the largest remaining cost.

## Method

- Apple M3 Max, 16 logical CPUs, 48 GiB RAM, macOS arm64, Node 24.13.0.
- Seven measured runs per variant, with seven rotated orders so every variant
  occupies every position once: **49 measured runs**, plus seven excluded
  warm-ups. No successful measured samples were discarded.
- All variants use the same absolute path in an isolated package copy, the same
  installed dependencies, and a fresh process per invocation. Existing host
  activity continued. The main checkout's build outputs and cache were untouched.
- Both Rust binaries use Cargo's release profile. Timings include process
  startup and shutdown, excluding binary compilation, cache preparation, output
  comparison, and removal of `dist`.
- Cold clears only the Rust transform cache. Compiled WASM and operating-system
  caches remain available. Cold runs process 2,669 transform inputs; warm runs
  execute zero transforms. Before and after have separate persistent caches.
- Kept-output runs start with the verified outputs of the preceding build.
  Existing files are validated by contents, rather than assumed valid.

## Verification

All 49 measured compilation runs and seven warm-ups matched Taskr's **5,361
output files byte for byte**, including paths, entry types, and executable bits.

Separate cold and warm full release builds both matched **8,453 files exactly**;
neither needed the agreed Rspack exception. The `ncc_node_anser` recipe also
matched Taskr's three output files, exercising deferred NCC loading. Full release
verification exercises deferred Rspack loading.

Eight Rust tests passed, including parallel restoration, unchanged-file
preservation, duplicate destinations, completion after write failure, cached
artifact restoration, and serial barriers. Thirteen JavaScript tests passed;
the real adapter's cached-SWC test forbids loading NCC or Rspack. Clippy,
ESLint, Rust formatting, and Prettier passed. The two native filesystem watch
tests were not rerun in this sandbox.

The packaged launcher binary matches the measured release binary. The adjacent
[JSON report](./2026-09-08-materialization.json) preserves timings, hashes,
profiling observations, and correctness results. Scripts, the isolated checkout,
logs, and manifests are retained in `/tmp/next-taskr-binary-cache-20260908/`.

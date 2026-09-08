# Keeping artifact contents in Rust — 2026-09-08

Source and cached output bytes now stay in Rust while Node recipes carry
recipe-scoped handles. On cache hits, `.swc().target()` sends metadata and
destination paths instead of moving output bytes to Node and back. JavaScript
plugins and `.run()` callbacks explicitly load their file contents; the adapter
then drops the handles so subsequent Buffer mutations or replacement strings
cannot accidentally emit the original contents.

Handles never enter persistent cache keys, cannot be reused by another recipe,
and release their buffers when the recipe completes or fails. Error-code
artifacts use the same path. Cold SWC transforms still receive source bytes and
return emitted bytes through the existing Node emitters.

## Isolated compilation comparison

This measures `next_compile` alone, without concurrent TypeScript or Rspack.
All variants ran at the same absolute path in a temporary package copy, with the
same installed dependencies. The main checkout's `dist` and transform cache
were untouched. An optimized binary was prebuilt for each Rust implementation.

| Runner                       | Median wall time | Observed range |
| ---------------------------- | ---------------: | -------------: |
| Taskr                        |           1.88 s |    1.84–1.92 s |
| Rust before, cold transforms |           2.06 s |    2.02–2.13 s |
| Rust after, cold transforms  |           2.11 s |    1.81–2.32 s |
| Rust before, warm transforms |           1.49 s |    1.43–1.54 s |
| Rust after, warm transforms  |           1.32 s |    1.27–1.55 s |

Five measured runs per variant used a rotating order, with five warm-up runs
excluded. Paired geometric means show **8.4% less time for warm builds** relative
to the previous Rust bridge and **27.9% less time relative to Taskr**. Cold time
was effectively unchanged relative to the previous bridge (0.003% more time).
Paired results are not ratios of the marginal medians. No successful measured
samples were discarded. The shared machine remained under existing load.

Each invocation starts a new process and recreates `dist`. Timings include
process startup and shutdown; native compilation, output checks, and cache
preparation are excluded. Cold clears the Rust transform cache; compiled WASM
and operating-system caches remain available. All cold builds processed 2,669
transform inputs, and all warm builds executed zero transforms.

## Process-boundary traffic

A small wrapper counted bytes on the recipe worker's stdin and stdout for both
Rust variants. Values below are total decimal megabytes in both directions,
including protocol metadata. They exclude IPC between Node and its SWC children.

| Transform cache | Before | After | Reduction |
| --------------- | -----: | ----: | --------: |
| Cold            | 239.00 | 80.21 |     66.4% |
| Warm            | 160.92 |  2.13 |     98.7% |

On warm builds, Rust-to-Node traffic fell from 80.01 MB to 0.45 MB; Node-to-Rust
traffic fell from 80.90 MB to 1.68 MB. Remaining messages contain file metadata,
handles, and task requests. Removing almost all content transfers helps warm
builds, but source validation, persistent cache-key/result processing, and
output materialization still cost time. These results do not demonstrate faster
cold compilation or measure full-release speedups.

## Correctness

All 25 measured compilation runs and five warm-ups matched Taskr's **5,361
output files byte for byte**, including paths, entry types, and executable bits.

Separate complete release builds verified **8,453 files** for both cold and warm
Rust runs. The only accepted differences were the previously agreed Rspack
tracer module-ID spelling and corresponding source-map shifts in four files.

Verification passed:

- Five Rust integration tests, including large cached artifacts, restoration of
  deleted/corrupt outputs and error artifacts, input/context invalidation,
  duplicate transforms, serial barriers, explicit byte loading, and expired
  handles. The two native filesystem watch tests were not rerun in this sandbox.
- Thirteen JavaScript tests, including the real adapter's `.swc().target()` path
  rejecting byte access on cache hits, plugin mutation handling, and concurrent
  subprocess logging during large explicit content transfers.
- Clippy, ESLint, Rust formatting, and Prettier.
- The packaged launcher binary matches the measured optimized binary.

The [JSON results](./2026-09-08-artifact-handles.json) preserve individual runs,
traffic counts, hashes, and release comparison results. The isolated checkout,
comparison scripts, manifests, and logs are in
`/tmp/next-taskr-artifact-handles-20260908/`.

# Optimized Rust runner versus Taskr — 2026-09-07

The optimized Rust runner completes the full Next.js release build in **7.5%
less time with an empty transform cache** and **20.8% less time with a populated
transform cache**, using paired geometric means across six blocks. The benchmark
continued under existing host load as requested; these are local measurements,
not an isolated-machine or cross-platform performance claim.

| Runner                          | Median full release | Observed range | Paired time reduction |
| ------------------------------- | ------------------: | -------------: | --------------------: |
| Taskr                           |             23.54 s |  21.45–24.90 s |              baseline |
| Rust, empty transform cache     |             22.26 s |  18.10–24.91 s |                  7.5% |
| Rust, populated transform cache |             18.07 s |  16.60–20.56 s |                 20.8% |

The paired speedups (Taskr time divided by Rust time) are **1.081× cold** and
**1.263× warm**. Exploratory 95% paired bootstrap intervals, using 10,000 block
resamples, are 1.028–1.138× and 1.204–1.338× respectively. These correspond to
approximately 2.7–12.1% and 16.9–25.3% less time. Paired comparisons are not ratios
of the marginal medians. One cold run was effectively tied with Taskr, taking
0.002 seconds longer; the improvement is an aggregate result.

## Changes that removed the regression

- Share compiler options, fingerprints, and the error-code table by content
  digest. Previously the 253,425-byte error table was repeated for 2,669 inputs,
  approximately 645 MiB before JSON escaping, even on cache hits.
- Batch up to 32 SWC inputs per cache entry, process independent requests
  concurrently, and batch output materialization on blocking filesystem workers.
  Failed native batches finish before a worker accepts another batch, preserving
  isolation of generated error-code artifacts. Changing one input invalidates
  its bounded batch.
- Seed private SWC worker caches from the existing compiled WASM cache. Workers
  retain separate writable caches and atomically publish complete new entries
  after successful work. This avoids recompiling the same WASM plugins for each
  worker on each invocation.
- Read compiler fingerprint inputs with bounded concurrency while retaining
  deterministic hashing order.
- Run declaration generation alongside JavaScript compilation and runtime
  bundling, after dependency copies complete. The JavaScript branch still runs
  `next_compile`, `next_bundle`, and `capsize_metrics` in sequence. Declaration
  generation was verified independently without the compiled JavaScript outputs:
  all 1,525 generated declaration files matched; another 26 declarations are
  source copies supplied by the JavaScript branch.
- Build the normal launcher binary with Cargo's optimized release profile.
  Both the original and this benchmark explicitly used release binaries, so a
  profile change does not account for the measured improvement.

Concurrency also exposed a protocol failure: subprocess startup messages could
interleave with a large JSON response and leave the runner waiting indefinitely.
Worker and subprocess logs now use stderr, reserving stdout for protocol frames.
Malformed responses and worker exits fail pending requests. Regression checks
exercise large protocol messages with concurrent subprocess logging and a
malformed-response worker that stays alive.

## Workload and controls

- Apple M3 Max, 16 logical CPUs, 48 GiB RAM, macOS arm64; Node 20.20.0,
  pnpm 10.33.0, Taskr 1.1.0, SWC 1.11.24, Rspack 1.6.7, NCC 0.38.4,
  TypeScript 6.0.2.
- Revision `416bf20921cc3ffeab61a181927ae0c4051088f8`, plus the uncommitted
  runner implementation and performance fixes. The [JSON report](./2026-09-07-optimized.json)
  records source and binary hashes.
- Taskr: `pnpm --filter=next build`. Rust: `pnpm --filter=next build:rust --stats`,
  with `NEXT_TASKR_BINARY` selecting the prebuilt release binary.
- Each invocation clears `dist` and performs a complete release build. Timings
  include pnpm and launcher startup, but exclude Cargo compilation, artifact
  comparison, cache preparation, and the equal 10-second cooldown between runs.
  Both variants use the same absolute checkout path and installed dependencies.
- Six measured builds per variant, with all six order permutations. Two warm-up
  builds are excluded. No successful measured sample was discarded.
- Cold clears only the Rust persistent transform cache. Both runners retain the
  SWC compiled WASM cache, operating-system caches, and other build-tool caches.
  Every cold Rust build processed 2,669 transform inputs; every warm build
  executed zero transformations. Existing transform-cache contents were backed
  up outside the repository and restored afterward.

## Phase timings and limits

| Runner                          | Median `next_compile` | Median declaration generation |
| ------------------------------- | --------------------: | ----------------------------: |
| Taskr                           |                2.19 s |                       13.92 s |
| Rust, empty transform cache     |                4.41 s |                       20.04 s |
| Rust, populated transform cache |                2.29 s |                       15.89 s |

Cold file compilation still has overhead relative to Taskr. Declaration
generation also takes longer while competing with the JavaScript branch. The
full-build gain comes from removing unnecessary work and shortening the critical
path through concurrency; it is not evidence that every phase is faster.

The [original report](./2026-09-07.md) measured 76% more time cold and 24% more time
warm. Host load differed, so absolute times across the two reports should not be
treated as a controlled before/after comparison. Each report pairs Rust with its
own interleaved Taskr baseline.

## Correctness and verification

All **18 measured builds** completed and passed comparison of **8,453 output
files** each. Seventeen matched raw bytes exactly. One warm run required the
agreed Rspack exception for four runtime bundle/source-map files: only the
`./lib/trace/tracer` versus `../lib/trace/tracer` module-ID spelling and its
corresponding source-map column shifts are accepted. No other artifact
differences were accepted. Paths, entry types, and executable bits are checked.

Verification passed:

- Six Rust integration tests, including persistent cache restoration,
  invalidation, serial barriers, protocol failures, watch recovery, and symlinks.
- Eleven JavaScript tests covering SWC output and error artifacts, concurrent
  batches, WASM cache isolation, protocol logging, and strict artifact comparison.
- Two existing standalone Webpack integration tests against the optimized build.
- Clippy with warnings denied, ESLint, Prettier, and Rust formatting checks.

Intermediate complete benchmark series and the interrupted series that exposed
the protocol bug are recorded separately in the JSON report. They are not mixed
into these results. The final series ran entirely with the corrected protocol
and unchanged runner inputs.

## Individual runs

Full-release seconds, excluding verification and cooldown:

| Block | Run order           |  Taskr | Rust cold | Rust warm |
| ----- | ------------------- | -----: | --------: | --------: |
| 1     | Taskr → cold → warm | 21.448 |    18.100 |    17.101 |
| 2     | cold → warm → Taskr | 21.781 |    18.600 |    16.715 |
| 3     | warm → Taskr → cold | 23.880 |    22.834 |    16.597 |
| 4     | Taskr → warm → cold | 24.904 |    24.906 |    20.557 |
| 5     | warm → cold → Taskr | 23.714 |    23.279 |    20.407 |
| 6     | cold → Taskr → warm | 23.360 |    21.683 |    19.043 |

## Reproduce

In a bootstrapped checkout, without another process writing its build outputs:

```sh
cargo build -p next-taskr --release
node scripts/benchmark-taskr.js /tmp/taskr-benchmark-new-run --cooldown-ms=10000
```

The results directory must be new. Full logs, phase events, and comparisons for
this series are in `/tmp/next-taskr-benchmark-2026-09-07-verified/`. The adjacent
[JSON report](./2026-09-07-optimized.json) preserves timings, phase summaries,
provenance, accepted-difference paths, and references to intermediate results.

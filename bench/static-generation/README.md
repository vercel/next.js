# Static generation benchmark

Measures the static generation step of `next build` ("Generating static
pages") on three fixtures that stress it in different ways:

| Fixture        | What it does                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `fetch-skewed` | 2,400 fast pages plus 300 slow pages whose upstream fetch takes 200–500ms. The slow pages sit next to each other in the path list, so the worker that gets them becomes the long tail. Every page also does a shared `force-cache` fetch (20 distinct URLs). |
| `cpu-bound`    | 600 pages with large server component trees and no fetches.                                                                                                                                                                                                  |
| `memory-heavy` | 160 pages that each keep a large array (500k objects) alive across a 4s wait. Fine at the default concurrency of 8; with `--env=BENCH_MAX_CONCURRENCY=64` the workers run out of memory.                                                                     |

## Running

Build Next.js first (`pnpm --filter=next build`), then:

```bash
node bench/static-generation/run.mjs --label=baseline --out=/tmp/baseline.json
```

Options:

- `--fixtures=fetch-skewed,cpu-bound,memory-heavy` – which fixtures to build.
- `--runs=N` – builds per fixture.
- `--env=KEY=VALUE` – extra environment for the build. The fixtures read:
  - `BENCH_WORKERS` – `experimental.cpus` (default `2`).
  - `BENCH_MAX_CONCURRENCY` – `experimental.staticGenerationMaxConcurrency`.
  - `BENCH_MIN_PAGES_PER_WORKER` – `experimental.staticGenerationMinPagesPerWorker`.
  - `BENCH_WORKER_THREADS=1` – `experimental.workerThreads`.
  - `BENCH_ADAPTIVE=1` – `experimental.staticGenerationAdaptive`.
  - `BENCH_CHUNK_SIZE` – `experimental.staticGenerationChunkSize`.
  - Page counts: `BENCH_FAST_PAGES`, `BENCH_SLOW_PAGES`, `BENCH_CPU_PAGES`,
    `BENCH_MEM_PAGES`, `BENCH_MEM_OBJECTS`, `BENCH_MEM_WAIT_MS`.

The runner starts a local delay server for `fetch-skewed`, builds each fixture
with `NEXT_STATIC_GENERATION_PROFILE=1`, and prints:

- `staticGenMs` – time from the first page starting to the last page finishing.
- `tailSpreadMs` – time between the first and the last worker finishing.
- `meanIdlePct` – share of the static generation window in which a worker's
  event loop was idle (waiting on I/O or waiting for work), averaged over
  workers.
- `peakRssMB` – highest RSS of any worker.
- `fetchHitRate` – fetch cache hits / lookups.
- `oomCount` – out-of-memory crashes seen in the build output.

## Profiling any app

`NEXT_STATIC_GENERATION_PROFILE=1 next build` works on any app. Workers write
per-page and per-sample records to `.next/diagnostics/static-generation/`,
and the build writes `.next/diagnostics/static-generation-summary.json`.

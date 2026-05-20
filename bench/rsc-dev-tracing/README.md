# RSC Dev Tracing Benchmark

This fixture profiles `next dev --experimental-cpu-prof` overhead in App Router
RSC rendering when React debug tracing is enabled. It was added to investigate
the cost of React Server Components async hooks and await-stack attribution in
development.

The app has two routes:

- `/`: 500 synchronous server component leaves behind `await connection()` and a
  Suspense boundary.
- `/async`: 500 async server component leaves, each awaiting two resolved
  promises, also behind `await connection()` and a Suspense boundary.

The route shape intentionally keeps the application code simple so the profile is
dominated by framework/dev tracing work. Treat absolute numbers as local-machine
data and compare relative before/after runs.

## Commands

Build `next` after source changes:

```bash
pnpm --filter=next build
```

Run the benchmark in regular App Router mode:

```bash
RUN_LABEL=app-router PORT=3157 ITERATIONS=40 \
  pnpm --silent bench:rsc-dev-tracing
```

Run the same app with Cache Components enabled:

```bash
CACHE_COMPONENTS=1 RUN_LABEL=cache-components PORT=3158 ITERATIONS=40 \
  pnpm --silent bench:rsc-dev-tracing
```

Artifacts are written to:

```text
bench/rsc-dev-tracing/artifacts/<run-label>/
```

Each run writes:

- `results.json`: cold request timings and warm p50/p95/avg/min/max.
- `next-dev.log`: dev server output.
- copied `.cpuprofile` files from `app/.next-profiles/`.

Analyze a profile:

```bash
pnpm --silent bench:rsc-dev-tracing:analyze \
  bench/rsc-dev-tracing/artifacts/<run-label>/<profile>.cpuprofile
```

## Investigation Notes

Environment used for the benchmark data below:

- Node `v24.14.0`
- 40 warm iterations per route
- local `pnpm --filter=next build` before each source variant

Warm p50/p95 in milliseconds:

| Variant | App sync | App async | Cache sync | Cache async |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 67.8 / 92.3 | 145.6 / 173.3 | 117.9 / 136.1 | 187.5 / 212.3 |
| Specialized userspace stack probe | 62.1 / 100.7 | 121.5 / 132.7 | 110.1 / 115.6 | 160.1 / 170.6 |
| `filterStackFrame` cache | 59.2 / 125.3 | 120.7 / 135.6 | 107.7 / 140.1 | 166.6 / 174.0 |
| Combined stack probe + filter cache | 59.5 / 75.8 | 109.7 / 125.8 | 111.8 / 184.2 | 156.4 / 202.1 |
| No-bind allocation experiment | 78.3 / 124.0 | 144.2 / 210.0 | 182.5 / 369.4 | 247.6 / 713.5 |
| `performance.now()` coalescing | 128.2 / 604.8 | 215.7 / 758.6 | 141.5 / 222.8 | 198.2 / 303.6 |
| Skip await stack capture | 60.2 / 76.9 | 77.5 / 91.9 | 128.6 / 215.0 | 140.8 / 264.2 |

The only change kept in this PR is the specialized userspace stack probe. The
`filterStackFrame` cache was not kept because the benchmark repeats the same
component sites many times, so it may overstate real-world benefit. The no-bind
and timestamp coalescing experiments regressed. Skipping await stack capture is
the largest win, but loses precise await callsite attribution.

# Render Pipeline Benchmark

This benchmark targets the full App Router render path (`renderToHTMLOrFlight`) via real HTTP requests through `bench/next-minimal-server`.

It supports:
- Node streams mode benchmarking
- route-based stress suites for streaming SSR
- CPU/heap profiling for the server process
- Node trace events and Next internal trace artifact capture

## Scenarios

### `--scenario=e2e` (default)

Runs `next build` + `next start`, exercising the full production stack:
`startServer()` → `router-server.initialize()` → `NextNodeServer` → app render.
Use this for production-realistic throughput numbers.

```bash
pnpm bench:render-pipeline --scenario=e2e --stream-mode=node
```

### `--scenario=minimal-server`

Bypasses the router-server layer entirely. Starts a bare `NextServer` with
`minimalMode: true` via `bench/next-minimal-server`. Use this to isolate the
render pipeline from routing/middleware overhead — useful when profiling changes
to `app-render.tsx`, streaming, or Flight serialization.

```bash
pnpm bench:render-pipeline --scenario=minimal-server --stream-mode=node
```

When comparing both scenarios, the delta reveals how much overhead the
router-server layer adds on top of the raw render path.

## Quick start

Run end-to-end benchmark (default stress routes):

```bash
pnpm bench:render-pipeline --scenario=e2e --stream-mode=node
```

CPU profiling is off by default. Enable with `--capture-cpu=true` for profiling runs.

Skip rebuild for faster iteration (after you already built once):

```bash
pnpm bench:render-pipeline --scenario=e2e --stream-mode=node --build=false
```

Output JSON report:

```bash
pnpm bench:render-pipeline --scenario=e2e --stream-mode=node --json-out=/tmp/render-pipeline.json
```

## Profiling and traces

Capture CPU profiles + Node trace events + Next trace logs:

```bash
pnpm bench:render-pipeline \
  --scenario=e2e \
  --stream-mode=node \
  --capture-cpu=true \
  --capture-trace=true \
  --capture-next-trace=true
```

Artifacts are written to:

```text
bench/render-pipeline/artifacts/<timestamp>/
```

Per run this includes:
- `<mode>.cpuprofile` (if `--capture-cpu=true`)
- `<mode>.heapprofile` (if `--capture-heap=true`)
- `<mode>-trace-*.json` (if `--capture-trace=true`)
- `next-trace-build.log` and `next-runtime-trace.log` (if `--capture-next-trace=true`)

Open `.cpuprofile` files in Chrome DevTools Performance panel.

Analyze results and CPU hotspots from artifacts:

```bash
pnpm bench:render-pipeline:analyze --artifact-dir=bench/render-pipeline/artifacts/<timestamp>
```

Omit `--artifact-dir` to analyze the latest run automatically.

## Generated client graph

`bench/basic-app` generates a bulk client-side module graph plus synthetic
route segments (`app/ui/vendor/`, `app/g/`, both gitignored) before
building, via `bench/basic-app/scripts/generate-client-graph.mjs`. The
benchmark runs the generator automatically; run it manually once if you
build `bench/basic-app` outside the harness. Without it, a small app's
uniform routes let the production chunker merge client code into a
handful of chunks, which makes client-reference import rows in the Flight
payload unrealistically small compared to production apps.

## Stress routes

Default routes:
- `/`
- `/attributes` (attribute and inline-style serialization)
- `/tailwind` (realistic utility-class-heavy dashboard)
- `/dashboard` (app-shaped workload: client-reference imports, streamed panels, tables mixing markup and client atoms)
- `/docs` (documentation-shaped workload: nav metadata tree as data, server-highlighted code)
- `/blog` (content-index workload: server-rendered cards plus rich-text post data as client props)
- `/streaming/light`
- `/streaming/medium`
- `/streaming/heavy`
- `/streaming/chunkstorm`
- `/streaming/wide`
- `/streaming/bulk`

The `streaming/*` pages now include a client boundary per Suspense chunk, so benchmark runs also stress Server-to-Client payload serialization in Flight data.

Override with:

```bash
pnpm bench:render-pipeline --scenario=e2e --routes=/,/streaming/heavy
```

## Per-route document metrics

Each run reports, per route, alongside latency:

- **ttfb** — time to first body byte, from stream reading. Catches shell-flush
  regressions that total latency hides on streaming routes.
- **document bytes** — decompressed body size, plus the share of bytes inside
  inline `self.__next_f.push(...)` Flight scripts and the inline script count.
  Byte totals are deterministic per build (fixture data is seeded), so any
  delta in an A/B comparison is a real payload change — no repeat runs needed.
  They also double as a check that both sides of a comparison rendered the
  same output. The script *count* is not stable: Fizz wraps whatever Flight
  rows are pending into one script per flush, so the count varies with write
  timing. Compare bytes, not counts.

## Client trace pass (opt-in)

```bash
pnpm bench:render-pipeline:client --build=true
```

Drives Chromium over the production server with CDP tracing and CPU throttling
(default 4x) and reports main-thread attribution buckets per route:

- per-chunk script eval and compile time (with file counts)
- inline script eval time (Flight `__next_f.push` scripts plus Fizz's tiny
  `$RS`/`$RC` boundary-reveal scripts; Flight dominates duration)
- off-main-thread streaming parse CPU (`v8.parseOnBackgroundParsing`) —
  most parse cost for large external chunks lands here, not in the
  main-thread compile bucket
- time to the `bench:hydrated` mark (shell hydration commit)
- long tasks / total blocking time before hydration, clipped to the
  pre-hydration portion of each task (null when the mark is not
  observed — there is no well-defined window without it)
- GC time (top-level `MinorGC`/`MajorGC` pauses only; GC can fire inside
  eval, so buckets overlap and are not meant to sum to wall time)
- JS transferred vs parsed bytes

The `bench:hydrated` mark comes from a small client component in the
fixture root layout (`app/ui/hydration-mark.js`, the shape of an
analytics provider). It is part of the measured payload on every route,
so byte totals from builds before it was added are not comparable.

FCP/LCP/DOMContentLoaded/load are extracted from the same trace as secondary
rows — sanity anchors, not comparison metrics. Attribution buckets are stable
at low sample counts (default 3 per route, cold visit each), so this pass adds
minutes, not tens of minutes. Tracing perturbs timing: never use this pass for
latency/throughput numbers, and never run it concurrently with the HTTP
benchmark. Raw traces land in the artifact dir (`client-trace-<route>.json`,
loadable in Chrome DevTools Performance panel or https://ui.perfetto.dev).

Reuse a server started elsewhere with `--start-server=false --port=<port>`.
Chromium comes from the repo's `playwright` dependency; if launch fails, run
`pnpm exec playwright install chromium`.

## Measurement model

The benchmark uses a **closed-loop** load generator: each concurrent worker
issues the next request only after the current one completes. This means:

- **Throughput numbers are reliable for relative comparison** (before/after a
  code change). Both sides experience the same measurement
  model, so deltas are valid.
- **Latency percentiles (p95, max) under load are optimistic.** Slow requests
  reduce back-pressure instead of queuing, masking tail latency. Do not compare
  absolute latency values from this benchmark to open-loop tools like k6 or wrk2.

CPU profiling (`--capture-cpu`) is disabled by default to avoid inflating
measurements. Run a separate profiling pass with `--capture-cpu=true` when you
need `.cpuprofile` artifacts.

## Common tuning flags

- `--warmup-requests=50`
- `--warmup-until-stable=true`
- `--serial-requests=120`
- `--load-requests=1200`
- `--load-concurrency=80`
- `--timeout-ms=30000`
- `--port=3199`

## Optional micro benchmarks

The runner also supports helper-only micro benchmarks:

```bash
pnpm bench:render-pipeline --scenario=micro
```

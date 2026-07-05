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

## Stress routes

Default routes:
- `/`
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

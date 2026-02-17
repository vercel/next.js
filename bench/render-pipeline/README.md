# Render Pipeline Benchmark

This benchmark targets the full App Router render path (`renderToHTMLOrFlight`) via real HTTP requests through `bench/next-minimal-server`.

It supports:
- `web` vs `node` streams mode comparison
- route-based stress suites for streaming SSR
- CPU/heap profiling for the server process
- Node trace events and Next internal trace artifact capture

## Quick start

Run end-to-end benchmark (default stress routes):

```bash
pnpm bench:render-pipeline --scenario=full --stream-mode=both
```

For `scenario=full` and `scenario=all`, CPU profiles are captured by default.
Disable with `--capture-cpu=false` if you want lower-overhead runs.

Skip rebuild for faster iteration (after you already built once):

```bash
pnpm bench:render-pipeline --scenario=full --stream-mode=node --build-full=false
```

When `--stream-mode=both`, the runner forces `--build-full=true` so web/node
comparisons do not accidentally reuse stale build output.

Output JSON report:

```bash
pnpm bench:render-pipeline --scenario=full --stream-mode=both --json-out=/tmp/render-pipeline.json
```

## Profiling and traces

Capture CPU profiles + Node trace events + Next trace logs:

```bash
pnpm bench:render-pipeline \
  --scenario=full \
  --stream-mode=both \
  --capture-trace=true \
  --capture-next-trace=true
```

Artifacts are written to:

```text
bench/render-pipeline/artifacts/<timestamp>/
```

Per mode (`web` and `node`) this includes:
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
pnpm bench:render-pipeline --scenario=full --routes=/,/streaming/heavy
```

## Common tuning flags

- `--warmup-requests=30`
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

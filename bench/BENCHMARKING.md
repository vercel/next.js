# Benchmarking Playbook (Render Pipeline)

This is the practical workflow for benchmarking and profiling render pipeline changes in this repo.

Primary tools:

- `pnpm bench:render-pipeline`
- `pnpm bench:render-pipeline:analyze`

## 1. Build-first baseline

Always rebuild `next` before benchmark runs when framework source changed.

```bash
pnpm --filter=next build
```

## 2. E2E benchmark (real production server)

This is the default scenario. It runs `next build` + `next start`, exercising the full production stack: `startServer()` → `router-server.initialize()` → `NextNodeServer` → app render.

Node streams only:

```bash
pnpm bench:render-pipeline \
  --scenario=e2e \
  --stream-mode=node \
  --build=true \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

Web vs Node comparison:

```bash
pnpm bench:render-pipeline \
  --scenario=e2e \
  --stream-mode=both \
  --build=true \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

## 3. Minimal-server benchmark (isolated render path)

Use `--scenario=minimal-server` to bypass the router-server layer and measure the render pipeline in isolation. This starts a bare `NextServer` with `minimalMode: true` via `bench/next-minimal-server` — no `router-server`, no middleware, no asset serving. Prefer this when profiling changes to `app-render.tsx`, streaming internals, or Flight serialization where router overhead would add noise.

```bash
pnpm bench:render-pipeline \
  --scenario=minimal-server \
  --stream-mode=node \
  --build=true \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

The delta between e2e and minimal-server results for the same route reveals how much overhead the router-server layer contributes.

## 4. Route-focused stress runs

Use this when targeting streaming-heavy behavior only.

```bash
pnpm bench:render-pipeline \
  --scenario=e2e \
  --stream-mode=node \
  --build=true \
  --routes=/streaming/heavy,/streaming/chunkstorm,/streaming/wide \
  --warmup-requests=10 \
  --serial-requests=40 \
  --load-requests=400 \
  --load-concurrency=40 \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

Default stress routes currently include:

- `/`
- `/streaming/light`
- `/streaming/medium`
- `/streaming/heavy`
- `/streaming/chunkstorm`
- `/streaming/wide`
- `/streaming/bulk`

## 5. Capture CPU profiles and traces

```bash
pnpm bench:render-pipeline \
  --scenario=e2e \
  --stream-mode=node \
  --build=true \
  --capture-trace=true \
  --capture-next-trace=true \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

Artifacts are written under:

- `bench/render-pipeline/artifacts/<run>/node/node.cpuprofile`
- `bench/render-pipeline/artifacts/<run>/node/node-trace-*.json`
- `bench/render-pipeline/artifacts/<run>/node/next-runtime-trace.log`
- `bench/render-pipeline/artifacts/<run>/results.json`

## 6. Analyze hotspots

```bash
pnpm bench:render-pipeline:analyze \
  --artifact-dir=bench/render-pipeline/artifacts/<run> \
  --top=20
```

## 7. Compare two runs quickly

```bash
node - <<'NODE'
const fs = require('fs')
const [baseRun, candRun] = process.argv.slice(2)
const load = (name) =>
  JSON.parse(
    fs.readFileSync(`bench/render-pipeline/artifacts/${name}/results.json`, 'utf8')
  ).fullResults[0].routeResults

const base = load(baseRun)
const cand = load(candRun)
for (const b of base) {
  const c = cand.find((x) => x.route === b.route && x.phase === b.phase)
  if (!c) continue
  const throughputDelta =
    ((c.throughputRps - b.throughputRps) / b.throughputRps) * 100
  const p95Delta = ((b.latency.p95 - c.latency.p95) / b.latency.p95) * 100
  console.log(
    `${b.route} ${b.phase} throughput ${throughputDelta >= 0 ? '+' : ''}${throughputDelta.toFixed(2)}% p95 ${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}%`
  )
}
NODE baseline-run candidate-run
```

## 8. Noise control rules

Use these rules to keep measurements trustworthy:

- Build first (`pnpm --filter=next build`) after framework source changes.
- Compare runs with identical route sets and request knobs.
- Repeat suspicious runs at least once (especially if one route regresses while others improve).
- Use dedicated artifact directories per run.
- Prefer relative deltas across multiple runs over one-off absolute numbers.
- When comparing e2e vs minimal-server scenarios, remember that e2e includes the full router-server overhead.

## 9. Suggested iteration loop

1. Change one thing.
2. Build (`pnpm --filter=next build`).
3. Run `--scenario=e2e` for production-realistic numbers.
4. Run `--scenario=minimal-server` to isolate render-path-only impact (skip this if your change is in routing/middleware, not the render pipeline).
5. Run focused stress routes with CPU profile (`--capture-cpu=true`).
6. Analyze hotspots and compare deltas.
7. Keep only changes that hold up across repeat runs.

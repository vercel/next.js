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

## 8. A/B branch comparison

When comparing two branches (e.g. canary vs a PR), follow this workflow to get reliable numbers.

**Start with a focused route, not the full suite.** The full suite takes ~3 minutes per run. Pick the route where your change has the largest proportional impact — typically the lightest route (`/`) for per-request overhead changes, or a specific streaming route for render pipeline changes.

**Increase request counts for fast routes.** The default `--serial-requests=120` is too noisy for sub-2ms routes. Use at least 500 serial and 5000 load requests:

```bash
pnpm bench:render-pipeline \
  --scenario=e2e \
  --stream-mode=node \
  --build=false \
  --routes=/ \
  --serial-requests=500 \
  --load-requests=5000 \
  --load-concurrency=80 \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

**Run at least 3 times per side.** A single run can swing 10–15% on light routes due to JIT warmup variance and system noise. Three runs let you average out outliers and spot whether a delta is real.

**Compare absolute req/s, not deltas.** Percentage deltas from a single pair of runs can be misleading. Line up the raw numbers side by side across all runs to see the full picture.

**Watch for system state drift.** Running all baseline runs first, then all candidate runs, means the later runs may be affected by thermal throttling or background processes. If results look suspicious, interleave runs (baseline, candidate, baseline, candidate) to control for this.

Example workflow:

```bash
# 1. Checkout baseline, build, run 3 times
git checkout canary
pnpm --filter=next build
for i in 1 2 3; do
  pnpm bench:render-pipeline --scenario=e2e --stream-mode=node --build=false \
    --routes=/ --serial-requests=500 --load-requests=5000 --load-concurrency=80 \
    --json-out=bench/render-pipeline/artifacts/baseline-$i/results.json \
    --artifact-dir=bench/render-pipeline/artifacts/baseline-$i
done

# 2. Checkout candidate, build, run 3 times
git checkout <branch>
pnpm --filter=next build
for i in 1 2 3; do
  pnpm bench:render-pipeline --scenario=e2e --stream-mode=node --build=false \
    --routes=/ --serial-requests=500 --load-requests=5000 --load-concurrency=80 \
    --json-out=bench/render-pipeline/artifacts/candidate-$i/results.json \
    --artifact-dir=bench/render-pipeline/artifacts/candidate-$i
done

# 3. Compare averages across runs
```

**Only run the full route suite once you've confirmed a signal on focused routes.** Use the full suite as a final check that the change doesn't regress other routes, not as the primary measurement.

## 9. Noise control rules

Use these rules to keep measurements trustworthy:

- Build first (`pnpm --filter=next build`) after framework source changes.
- Compare runs with identical route sets and request knobs.
- Repeat suspicious runs at least once (especially if one route regresses while others improve).
- Use dedicated artifact directories per run.
- Prefer relative deltas across multiple runs over one-off absolute numbers.
- When comparing e2e vs minimal-server scenarios, remember that e2e includes the full router-server overhead.

## 10. Suggested iteration loop

1. Change one thing.
2. Build (`pnpm --filter=next build`).
3. Run `--scenario=e2e` for production-realistic numbers.
4. Run `--scenario=minimal-server` to isolate render-path-only impact (skip this if your change is in routing/middleware, not the render pipeline).
5. Run focused stress routes with CPU profile (`--capture-cpu=true`).
6. Analyze hotspots and compare deltas.
7. Keep only changes that hold up across repeat runs.

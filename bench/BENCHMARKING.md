# Benchmarking Playbook (Render Pipeline / Node Streams)

This is the practical workflow for benchmarking and profiling render pipeline changes in this repo.

Primary tools:

- `pnpm bench:render-pipeline`
- `pnpm bench:render-pipeline:analyze`

## 1. Build-first baseline

Always rebuild `next` before benchmark runs when framework source changed.

```bash
pnpm --filter=next build
```

## 2. End-to-end benchmark (full app render path)

This measures the full request path (`renderToHTMLOrFlight`) through `bench/next-minimal-server`.
In `scenario=full` and `scenario=all`, `--capture-cpu` defaults to `true`.

Node streams only:

```bash
pnpm bench:render-pipeline \
  --scenario=full \
  --stream-mode=node \
  --build-full=true \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

Web vs Node comparison:

```bash
pnpm bench:render-pipeline \
  --scenario=full \
  --stream-mode=both \
  --build-full=true \
  --json-out=bench/render-pipeline/artifacts/<run>/results.json \
  --artifact-dir=bench/render-pipeline/artifacts/<run>
```

## 3. Route-focused stress runs

Use this when targeting streaming-heavy behavior only.

```bash
pnpm bench:render-pipeline \
  --scenario=full \
  --stream-mode=node \
  --build-full=true \
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

## 4. Isolate helper-level costs (micro scenario)

Use this to quickly test helper-level changes before full runs.

```bash
pnpm bench:render-pipeline \
  --scenario=micro \
  --iterations=300 \
  --warmup=30
```

Micro benchmark output includes cases for:

- `teeNodeReadable`
- `createBufferedTransformNode`
- `createInlinedDataNodeStream`
- `continueStaticPrerender` / `continueDynamicPrerender` / `continueDynamicHTMLResume`

Flight payload mode toggles:

```bash
# Binary-heavy flight chunks
pnpm bench:render-pipeline --scenario=micro --binary-flight=true

# UTF-8-heavy flight chunks
pnpm bench:render-pipeline --scenario=micro --binary-flight=false
```

Stress payload shape:

```bash
pnpm bench:render-pipeline \
  --scenario=micro \
  --iterations=300 \
  --warmup=30 \
  --flight-chunks=128 \
  --flight-chunk-bytes=8192 \
  --html-chunks=128 \
  --html-chunk-bytes=32768
```

## 5. Capture CPU profiles and traces

```bash
pnpm bench:render-pipeline \
  --scenario=full \
  --stream-mode=node \
  --build-full=true \
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

Filter only the Node-stream-relevant hotspots:

```bash
pnpm bench:render-pipeline:analyze --artifact-dir=bench/render-pipeline/artifacts/<run> --top=20 > /tmp/analyze.txt
rg "use-flight-response|encodeFlightDataChunkNode|node-stream-tee|flushPending|node-stream-helpers|htmlEscapeJsonString" /tmp/analyze.txt
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
NODE investigation-10-boundary-data investigation-17-profile-current
```

## 8. Noise control rules

Use these rules to keep measurements trustworthy:

- Build first (`pnpm --filter=next build`) after framework source changes.
- Compare runs with identical route sets and request knobs.
- Repeat suspicious runs at least once (especially if one route regresses while others improve).
- Use dedicated artifact directories per run.
- Prefer relative deltas across multiple runs over one-off absolute numbers.

## 9. Suggested iteration loop

1. Change one thing.
2. Build.
3. Run `scenario=micro` for quick signal.
4. Run focused full stress (`heavy/chunkstorm/wide`) with CPU profile.
5. Analyze hotspots and compare deltas.
6. Keep only changes that hold up across repeat runs.

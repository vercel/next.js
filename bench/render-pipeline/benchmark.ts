// This script must be run with tsx

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const NEXT_BIN = resolve(REPO_ROOT, 'packages/next/dist/bin/next')
const MINIMAL_SERVER = resolve(
  REPO_ROOT,
  'bench/next-minimal-server/bin/minimal-server.js'
)

type Scenario = 'minimal-server' | 'e2e'
type StreamMode = 'node'

type CliOptions = {
  scenario: Scenario
  jsonOut?: string

  appDir: string
  routes: string[]
  streamMode: StreamMode
  build: boolean
  warmupRequests: number
  warmupUntilStable: boolean
  serialRequests: number
  loadRequests: number
  loadConcurrency: number
  timeoutMs: number
  port: number

  isolateRoutes: boolean

  captureCpu: boolean
  captureHeap: boolean
  captureTrace: boolean
  captureNextTrace: boolean
  traceCategories: string
  artifactDir: string
}

type BenchStats = {
  min: number
  median: number
  mean: number
  stddev: number
  p95: number
  max: number
}

type FullRoutePhaseResult = {
  mode: StreamMode
  route: string
  phase: 'single-client' | 'under-load'
  requests: number
  errors: number
  concurrency: number
  throughputRps: number
  latency: BenchStats
}

type FullRunResult = {
  mode: StreamMode
  routeResults: FullRoutePhaseResult[]
}

function parseBoolean(value: string): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

function parseNumberArg(
  args: Map<string, string>,
  key: string,
  fallback: number
): number {
  const value = args.get(key)
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for --${key}: ${value}`)
  }
  return parsed
}

function parseRoutes(rawRoutes: string | undefined): string[] {
  if (!rawRoutes) {
    return [
      '/',
      '/streaming/light',
      '/streaming/medium',
      '/streaming/heavy',
      '/streaming/chunkstorm',
      '/streaming/wide',
      '/streaming/bulk',
    ]
  }

  const routes = rawRoutes
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean)

  if (routes.length === 0) {
    throw new Error('--routes cannot be empty')
  }

  for (const route of routes) {
    if (!route.startsWith('/')) {
      throw new Error(`Each route must start with '/': ${route}`)
    }
  }

  return routes
}

function usage() {
  console.log(`Usage: pnpm bench:render-pipeline [options]

Options:
  --scenario=e2e|minimal-server                  (default: e2e)
    e2e:            Real production server (next build + next start).
    minimal-server: NextServer with minimalMode, no router-server.
  --json-out=<path>

Benchmark options:
  --app-dir=<path>                              (default: bench/basic-app)
  --routes=/,/streaming/light,...               (default: built-in stress suite)
  --stream-mode=node                            (default: node)
  --build=true|false                             (default: true)
  --warmup-requests=<number>                    (default: 50)
                                                 Batch size per warmup iteration.
  --warmup-until-stable=true|false              (default: true)
                                                 Repeat warmup batches until mean latency
                                                 stabilizes (<5% delta). Max 10 batches.
  --serial-requests=<number>                    (default: 120)
  --load-requests=<number>                      (default: 1200)
  --load-concurrency=<number>                   (default: 80)
  --port=<number>                               (default: 3199)
  --timeout-ms=<number>                         (default: 30000)
  --isolate-routes=true|false                   (default: false)
                                                 Restart the server between routes to avoid
                                                 cross-route GC/memory contamination.

Profiling and trace options:
  --capture-cpu=true|false                      (default: false)
  --capture-heap=true|false                     (default: false)
  --capture-trace=true|false                    (default: false)
  --capture-next-trace=true|false               (default: true)
  --trace-categories=<csv>                      (default: node,node.async_hooks,v8)
  --artifact-dir=<path>                         (default: bench/render-pipeline/artifacts/<timestamp>)
`)
}

function parseCli(): CliOptions {
  const rawArgs = process.argv.slice(2)
  if (rawArgs.includes('--help')) {
    usage()
    process.exit(0)
  }

  const args = new Map<string, string>()
  for (const rawArg of rawArgs) {
    if (!rawArg.startsWith('--')) continue
    const [rawKey, rawValue] = rawArg.slice(2).split('=')
    args.set(rawKey, rawValue ?? 'true')
  }

  const scenarioRaw = args.get('scenario') ?? 'e2e'
  if (scenarioRaw !== 'minimal-server' && scenarioRaw !== 'e2e') {
    throw new Error(
      `Invalid --scenario value: ${scenarioRaw}. Use e2e|minimal-server`
    )
  }

  const streamModeRaw = args.get('stream-mode') ?? 'node'
  if (streamModeRaw !== 'node') {
    throw new Error(`Invalid --stream-mode value: ${streamModeRaw}. Use node`)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const artifactDir = resolve(
    REPO_ROOT,
    args.get('artifact-dir') ?? `bench/render-pipeline/artifacts/${timestamp}`
  )

  const routes = parseRoutes(args.get('routes'))
  const build = parseBoolean(args.get('build') ?? 'true')

  return {
    scenario: scenarioRaw,
    jsonOut: args.get('json-out'),

    appDir: resolve(REPO_ROOT, args.get('app-dir') ?? 'bench/basic-app'),
    routes,
    streamMode: streamModeRaw,
    build,
    warmupRequests: parseNumberArg(args, 'warmup-requests', 50),
    warmupUntilStable: parseBoolean(args.get('warmup-until-stable') ?? 'true'),
    serialRequests: parseNumberArg(args, 'serial-requests', 120),
    loadRequests: parseNumberArg(args, 'load-requests', 1200),
    loadConcurrency: parseNumberArg(args, 'load-concurrency', 80),
    timeoutMs: parseNumberArg(args, 'timeout-ms', 30_000),
    port: parseNumberArg(args, 'port', 3199),

    isolateRoutes: parseBoolean(args.get('isolate-routes') ?? 'false'),

    captureCpu: parseBoolean(args.get('capture-cpu') ?? 'false'),
    captureHeap: parseBoolean(args.get('capture-heap') ?? 'false'),
    captureTrace: parseBoolean(args.get('capture-trace') ?? 'false'),
    captureNextTrace: parseBoolean(args.get('capture-next-trace') ?? 'true'),
    traceCategories: args.get('trace-categories') ?? 'node,node.async_hooks,v8',
    artifactDir,
  }
}

function computeStats(samples: number[]): BenchStats {
  const sorted = [...samples].sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const median = sorted[Math.floor(sorted.length / 2)]
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
  const variance =
    samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    samples.length
  const stddev = Math.sqrt(variance)
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
  return { min, median, mean, stddev, p95, max }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })
  const [code] = (await once(child, 'exit')) as [number | null]
  if (code !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit ${code})`
    )
  }
}

async function ensureNextBuilt() {
  try {
    await access(NEXT_BIN)
  } catch {
    throw new Error(
      `Missing ${NEXT_BIN}. Build Next.js first (pnpm --filter=next build).`
    )
  }
}

function defaultConfig(): string {
  return 'module.exports = {}\n'
}

async function waitForServerReady(
  url: string,
  timeoutMs: number
): Promise<void> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      await response.arrayBuffer()
      if (response.ok) return
    } catch {
      // server not ready yet
    }
    await sleep(200)
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`)
}

async function requestLatencyMs(
  url: string,
  timeoutMs: number
): Promise<number> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const start = performance.now()
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    })
    await response.arrayBuffer()
    if (!response.ok) {
      throw new Error(`Request failed (${response.status}) for ${url}`)
    }
    return performance.now() - start
  } finally {
    clearTimeout(timeout)
  }
}

async function runSerialRequests(
  url: string,
  count: number,
  timeoutMs: number
): Promise<number[]> {
  const latencies: number[] = []
  for (let i = 0; i < count; i++) {
    latencies.push(await requestLatencyMs(url, timeoutMs))
  }
  return latencies
}

// Closed-loop load generator: each worker issues the next request only after
// the current one completes. This means throughput numbers are accurate for
// relative A/B comparison, but latency percentiles (p95, max) are optimistic
// because slow requests reduce back-pressure instead of queuing. Do not compare
// absolute latency values from this benchmark to open-loop tools (k6, wrk2).
async function runConcurrentRequests(
  url: string,
  totalRequests: number,
  concurrency: number,
  timeoutMs: number
): Promise<{ latencies: number[]; errors: number }> {
  const latencies: number[] = []
  let errors = 0
  let index = 0

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const current = index
      index++
      if (current >= totalRequests) return
      try {
        latencies.push(await requestLatencyMs(url, timeoutMs))
      } catch {
        errors++
      }
    }
  })

  await Promise.all(workers)
  return { latencies, errors }
}

async function copyIfExists(fromPath: string, toPath: string) {
  try {
    await access(fromPath)
    await copyFile(fromPath, toPath)
  } catch {
    // Ignore missing optional traces.
  }
}

function printFullResults(label: string, results: FullRunResult[]) {
  console.log(`\n${label}`)

  for (const result of results) {
    console.log(`\nMode: ${result.mode}`)

    for (const route of new Set(
      result.routeResults.map((entry) => entry.route)
    )) {
      console.log(`  Route: ${route}`)
      const routeEntries = result.routeResults.filter(
        (entry) => entry.route === route
      )
      for (const entry of routeEntries) {
        const errorSuffix = entry.errors > 0 ? ` errors=${entry.errors}` : ''
        console.log(
          `    ${entry.phase} requests=${entry.requests} concurrency=${entry.concurrency}${errorSuffix}`
        )
        console.log(
          `      throughput=${entry.throughputRps.toFixed(2)} req/s median=${entry.latency.median.toFixed(2)}ms p95=${entry.latency.p95.toFixed(2)}ms stddev=${entry.latency.stddev.toFixed(2)}ms`
        )
      }
    }
  }
}

function buildNodeArgs(
  options: CliOptions,
  modeArtifactDir: string,
  mode: string
): string[] {
  const args: string[] = []
  if (options.captureCpu) {
    args.push(
      '--cpu-prof',
      `--cpu-prof-dir=${modeArtifactDir}`,
      `--cpu-prof-name=${mode}.cpuprofile`
    )
  }
  if (options.captureHeap) {
    args.push(
      '--heap-prof',
      `--heap-prof-dir=${modeArtifactDir}`,
      `--heap-prof-name=${mode}.heapprofile`
    )
  }
  if (options.captureTrace) {
    args.push(
      '--trace-events-enabled',
      `--trace-event-categories=${options.traceCategories}`,
      `--trace-event-file-pattern=${resolve(modeArtifactDir, `${mode}-trace-\${pid}.json`)}`
    )
  }
  return args
}

async function gracefulKill(server: ReturnType<typeof spawn>) {
  const tryKill = async (signal: NodeJS.Signals, timeoutMs: number) => {
    server.kill(signal)
    const didExit = await Promise.race([
      once(server, 'exit')
        .then(() => true)
        .catch(() => true),
      sleep(timeoutMs).then(() => false),
    ])
    return didExit
  }

  if (!(await tryKill('SIGINT', 3000))) {
    if (!(await tryKill('SIGTERM', 3000))) {
      server.kill('SIGKILL')
      await once(server, 'exit').catch(() => undefined)
    }
  }
}

async function runWarmup(
  url: string,
  batchSize: number,
  untilStable: boolean,
  timeoutMs: number,
  label: string
): Promise<number> {
  const maxBatches = 10
  const stabilityThreshold = 0.05
  let totalRequests = 0
  let prevMean = Infinity

  for (let batch = 0; batch < (untilStable ? maxBatches : 1); batch++) {
    const latencies = await runSerialRequests(url, batchSize, timeoutMs)
    totalRequests += batchSize
    const mean = latencies.reduce((s, v) => s + v, 0) / latencies.length

    if (untilStable && batch > 0) {
      const delta = Math.abs(mean - prevMean) / prevMean
      if (delta < stabilityThreshold) {
        console.log(
          `[${label}] warmup stabilized after ${totalRequests} requests ` +
            `(batch ${batch + 1}, delta=${(delta * 100).toFixed(1)}%)`
        )
        return totalRequests
      }
    }
    prevMean = mean
  }

  if (untilStable) {
    console.log(
      `[${label}] warmup did not fully stabilize after ${totalRequests} requests, proceeding`
    )
  }
  return totalRequests
}

async function runRoutePhases(
  options: CliOptions,
  mode: StreamMode,
  label: string
): Promise<FullRoutePhaseResult[]> {
  const routeResults: FullRoutePhaseResult[] = []

  for (const route of options.routes) {
    const url = `http://127.0.0.1:${options.port}${route}`

    const warmupLabel = `${label}/${mode} route ${route}`
    console.log(
      `[${label}/${mode}] route ${route}: warmup (batch=${options.warmupRequests}, untilStable=${options.warmupUntilStable})`
    )
    await runWarmup(
      url,
      options.warmupRequests,
      options.warmupUntilStable,
      options.timeoutMs,
      warmupLabel
    )

    console.log(`[${label}/${mode}] route ${route}: single-client phase`)
    const serialStart = performance.now()
    const serialLatencies = await runSerialRequests(
      url,
      options.serialRequests,
      options.timeoutMs
    )
    const serialDurationMs = performance.now() - serialStart
    routeResults.push({
      mode,
      route,
      phase: 'single-client',
      requests: options.serialRequests,
      errors: 0,
      concurrency: 1,
      throughputRps: options.serialRequests / (serialDurationMs / 1000),
      latency: computeStats(serialLatencies),
    })

    console.log(`[${label}/${mode}] route ${route}: under-load phase`)
    const loadStart = performance.now()
    const loadResult = await runConcurrentRequests(
      url,
      options.loadRequests,
      options.loadConcurrency,
      options.timeoutMs
    )
    const loadDurationMs = performance.now() - loadStart
    if (loadResult.errors > 0) {
      console.warn(
        `[${label}/${mode}] route ${route}: ${loadResult.errors}/${options.loadRequests} requests failed`
      )
    }
    routeResults.push({
      mode,
      route,
      phase: 'under-load',
      requests: options.loadRequests,
      errors: loadResult.errors,
      concurrency: options.loadConcurrency,
      throughputRps: options.loadRequests / (loadDurationMs / 1000),
      latency: computeStats(loadResult.latencies),
    })
  }

  return routeResults
}

// ---------------------------------------------------------------------------
// Scenario: minimal-server (minimalMode: true, no router-server)
// ---------------------------------------------------------------------------

async function runMinimalServerSession(
  options: CliOptions,
  mode: StreamMode,
  modeArtifactDir: string,
  routeSubset: CliOptions
): Promise<FullRoutePhaseResult[]> {
  let server: ReturnType<typeof spawn> | null = null
  try {
    console.log(`[minimal-server/${mode}] starting server...`)

    const serverArgs = buildNodeArgs(options, modeArtifactDir, mode)
    serverArgs.push(MINIMAL_SERVER)

    server = spawn('node', serverArgs, {
      cwd: options.appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        PORT: String(options.port),
      },
      stdio: 'ignore',
    })

    await waitForServerReady(
      `http://127.0.0.1:${options.port}${routeSubset.routes[0]}`,
      options.timeoutMs
    )

    return await runRoutePhases(routeSubset, mode, 'minimal-server')
  } finally {
    if (server) {
      await gracefulKill(server)
    }

    if (options.captureNextTrace) {
      await copyIfExists(
        resolve(options.appDir, '.next/trace'),
        resolve(modeArtifactDir, 'next-runtime-trace.log')
      )
    }
  }
}

async function runMinimalServerModeBenchmark(
  options: CliOptions,
  mode: StreamMode
): Promise<FullRunResult> {
  const nextConfigPath = resolve(options.appDir, 'next.config.js')
  const originalConfig = await readFile(nextConfigPath, 'utf8')
  const modeArtifactDir = resolve(options.artifactDir, mode)

  await mkdir(modeArtifactDir, { recursive: true })

  try {
    await writeFile(nextConfigPath, defaultConfig())

    if (options.build) {
      console.log(`\n[minimal-server/${mode}] building app fixture...`)
      await runCommand('node', [NEXT_BIN, 'build'], options.appDir, {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
      })
      if (options.captureNextTrace) {
        await copyIfExists(
          resolve(options.appDir, '.next/trace-build'),
          resolve(modeArtifactDir, 'next-trace-build.log')
        )
      }
    }

    let routeResults: FullRoutePhaseResult[]

    if (options.isolateRoutes) {
      routeResults = []
      for (let i = 0; i < options.routes.length; i++) {
        if (i > 0) await sleep(1000)
        const subset = { ...options, routes: [options.routes[i]] }
        console.log(
          `[minimal-server/${mode}] isolate-routes: restarting server for ${options.routes[i]}`
        )
        routeResults.push(
          ...(await runMinimalServerSession(
            options,
            mode,
            modeArtifactDir,
            subset
          ))
        )
      }
    } else {
      routeResults = await runMinimalServerSession(
        options,
        mode,
        modeArtifactDir,
        options
      )
    }

    return { mode, routeResults }
  } finally {
    await writeFile(nextConfigPath, originalConfig)
  }
}

async function runMinimalServerBenchmarks(
  options: CliOptions
): Promise<FullRunResult[]> {
  await ensureNextBuilt()
  await mkdir(options.artifactDir, { recursive: true })

  const results: FullRunResult[] = []
  results.push(await runMinimalServerModeBenchmark(options, options.streamMode))
  return results
}

// ---------------------------------------------------------------------------
// Scenario: e2e (real production server via next build + next start)
// ---------------------------------------------------------------------------

async function runE2EServerSession(
  options: CliOptions,
  mode: StreamMode,
  modeArtifactDir: string,
  routeSubset: CliOptions
): Promise<FullRoutePhaseResult[]> {
  let server: ReturnType<typeof spawn> | null = null
  try {
    console.log(`[e2e/${mode}] starting production server (next start)...`)

    const serverArgs = buildNodeArgs(options, modeArtifactDir, mode)
    serverArgs.push(NEXT_BIN, 'start', '--port', String(options.port))

    server = spawn('node', serverArgs, {
      cwd: options.appDir,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'ignore',
    })

    await waitForServerReady(
      `http://127.0.0.1:${options.port}${routeSubset.routes[0]}`,
      options.timeoutMs
    )

    return await runRoutePhases(routeSubset, mode, 'e2e')
  } finally {
    if (server) {
      await gracefulKill(server)
    }

    if (options.captureNextTrace) {
      await copyIfExists(
        resolve(options.appDir, '.next/trace'),
        resolve(modeArtifactDir, 'next-runtime-trace.log')
      )
    }
  }
}

async function runE2EModeBenchmark(
  options: CliOptions,
  mode: StreamMode
): Promise<FullRunResult> {
  const nextConfigPath = resolve(options.appDir, 'next.config.js')
  const originalConfig = await readFile(nextConfigPath, 'utf8')
  const modeArtifactDir = resolve(options.artifactDir, mode)

  await mkdir(modeArtifactDir, { recursive: true })

  try {
    await writeFile(nextConfigPath, defaultConfig())

    if (options.build) {
      console.log(`\n[e2e/${mode}] building app fixture...`)
      await runCommand('node', [NEXT_BIN, 'build'], options.appDir, {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
      })
      if (options.captureNextTrace) {
        await copyIfExists(
          resolve(options.appDir, '.next/trace-build'),
          resolve(modeArtifactDir, 'next-trace-build.log')
        )
      }
    }

    let routeResults: FullRoutePhaseResult[]

    if (options.isolateRoutes) {
      routeResults = []
      for (let i = 0; i < options.routes.length; i++) {
        if (i > 0) await sleep(1000)
        const subset = { ...options, routes: [options.routes[i]] }
        console.log(
          `[e2e/${mode}] isolate-routes: restarting server for ${options.routes[i]}`
        )
        routeResults.push(
          ...(await runE2EServerSession(options, mode, modeArtifactDir, subset))
        )
      }
    } else {
      routeResults = await runE2EServerSession(
        options,
        mode,
        modeArtifactDir,
        options
      )
    }

    return { mode, routeResults }
  } finally {
    await writeFile(nextConfigPath, originalConfig)
  }
}

async function runE2EBenchmarks(options: CliOptions): Promise<FullRunResult[]> {
  await ensureNextBuilt()
  await mkdir(options.artifactDir, { recursive: true })

  const results: FullRunResult[] = []
  results.push(await runE2EModeBenchmark(options, options.streamMode))
  return results
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseCli()

  console.log('Render pipeline benchmark')
  console.log(`scenario=${options.scenario}`)

  let fullResults: FullRunResult[] | undefined

  console.log(
    `\nRunning ${options.scenario} benchmark: appDir=${options.appDir} streamMode=${options.streamMode}`
  )
  console.log(`routes=${options.routes.join(', ')}`)
  console.log(`artifacts=${options.artifactDir}`)

  if (options.scenario === 'e2e') {
    fullResults = await runE2EBenchmarks(options)
    printFullResults(
      'E2E PRODUCTION SERVER BENCHMARKS (next build + next start)',
      fullResults
    )
  } else {
    fullResults = await runMinimalServerBenchmarks(options)
    printFullResults(
      'MINIMAL-SERVER BENCHMARKS (minimalMode, no router-server)',
      fullResults
    )
  }

  if (options.jsonOut) {
    const outputPath = resolve(process.cwd(), options.jsonOut)
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          options,
          fullResults,
          generatedAt: new Date().toISOString(),
          node: process.version,
        },
        null,
        2
      )
    )
    console.log(`\nWrote JSON report: ${outputPath}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

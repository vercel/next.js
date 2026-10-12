// This script must be run with tsx
//
// Client-side attribution pass for the render-pipeline fixtures. Drives
// Chromium over the production server with CDP tracing enabled and
// decomposes main-thread time into framework-attributable buckets
// (per-chunk script compile/eval, inline Flight script cost, hydration,
// GC, long tasks). Paint milestones (FCP/LCP/DCL/load) are extracted from
// the same trace as free secondary rows — the buckets are the numbers to
// compare, milestones are sanity anchors.
//
// Tracing perturbs timing, so this is a separate opt-in pass (like
// --capture-cpu in benchmark.ts), not part of the default benchmark run.
// Attribution buckets are meaningful at low sample counts; the default is
// 3 samples per route.

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const NEXT_BIN = resolve(REPO_ROOT, 'packages/next/dist/bin/next')

const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'loading',
  'v8',
]

type CliOptions = {
  appDir: string
  routes: string[]
  samples: number
  cpuThrottle: number
  build: boolean
  startServer: boolean
  port: number
  timeoutMs: number
  settleMs: number
  artifactDir: string
  jsonOut?: string
}

// All times are ms relative to navigationStart. Buckets are sums of
// main-thread trace event durations, except parseBackgroundMs which sums
// v8.parseOnBackgroundParsing across the renderer's script-streamer
// threads — actual off-main-thread parse CPU, not the enclosing
// v8.parseOnBackground wall time, which is dominated by waiting for
// network bytes. Buckets overlap: compile events nest inside eval
// events, and GC pauses can fire inside eval too. They are reported
// separately for attribution, not meant to sum to wall time. The
// blocking-time fields are null when the bench:hydrated mark was not
// observed — without it there is no well-defined pre-hydration window.
type TraceSample = {
  fcpMs: number | null
  lcpMs: number | null
  domContentLoadedMs: number | null
  loadMs: number | null
  hydratedMs: number | null
  evalChunksMs: number
  evalChunkCount: number
  evalInlineMs: number
  evalInlineCount: number
  compileMs: number
  parseBackgroundMs: number
  gcMs: number
  longTasksToHydrated: number | null
  blockingTimeToHydratedMs: number | null
  jsTransferBytes: number
  jsParsedBytes: number
  jsFileCount: number
}

type RouteTraceResult = {
  route: string
  samples: TraceSample[]
  median: TraceSample
}

type TraceEvent = {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: {
    data?: {
      url?: string
      documentLoaderURL?: string
    }
  }
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

function usage() {
  console.log(`Usage: pnpm bench:render-pipeline:client [options]

Options:
  --app-dir=<path>            (default: bench/basic-app)
  --routes=/,/dashboard,...   (default: /,/dashboard,/docs,/blog,/tailwind)
  --samples=<number>          (default: 3)
  --cpu-throttle=<number>     (default: 4) CDP CPU throttling rate
  --build=true|false          (default: false) build the fixture first
  --start-server=true|false   (default: true) set false to attach to a
                              server already running on --port
  --port=<number>             (default: 3199)
  --timeout-ms=<number>       (default: 30000)
  --settle-ms=<number>        (default: 750) post-hydration wait so
                              prefetch processing lands in the trace
  --artifact-dir=<path>       (default: bench/render-pipeline/artifacts/<timestamp>-client)
  --json-out=<path>
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
    const eq = rawArg.indexOf('=')
    if (eq === -1) {
      args.set(rawArg.slice(2), 'true')
    } else {
      args.set(rawArg.slice(2, eq), rawArg.slice(eq + 1))
    }
  }

  const routes = (args.get('routes') ?? '/,/dashboard,/docs,/blog,/tailwind')
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

  const samples = parseNumberArg(args, 'samples', 3)
  if (samples < 1) {
    throw new Error(`--samples must be at least 1, got ${samples}`)
  }
  // CDP rejects rates below 1 (1 = no throttling).
  const cpuThrottle = parseNumberArg(args, 'cpu-throttle', 4)
  if (cpuThrottle < 1) {
    throw new Error(`--cpu-throttle must be at least 1, got ${cpuThrottle}`)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

  return {
    appDir: resolve(REPO_ROOT, args.get('app-dir') ?? 'bench/basic-app'),
    routes,
    samples,
    cpuThrottle,
    build: parseBoolean(args.get('build') ?? 'false'),
    startServer: parseBoolean(args.get('start-server') ?? 'true'),
    port: parseNumberArg(args, 'port', 3199),
    timeoutMs: parseNumberArg(args, 'timeout-ms', 30_000),
    settleMs: parseNumberArg(args, 'settle-ms', 750),
    artifactDir: resolve(
      REPO_ROOT,
      args.get('artifact-dir') ??
        `bench/render-pipeline/artifacts/${timestamp}-client`
    ),
    jsonOut: args.get('json-out'),
  }
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  })
  const [code] = (await once(child, 'exit')) as [number | null]
  if (code !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(' ')} (exit ${code})`
    )
  }
}

async function waitForServerReady(
  url: string,
  timeoutMs: number,
  serverDied?: () => boolean
): Promise<void> {
  const start = performance.now()
  while (performance.now() - start < timeoutMs) {
    // Without this check, a server that dies on startup (e.g. EADDRINUSE
    // against a stale server on the same port) is indistinguishable from
    // a slow one — worse, a 200 from whatever else owns the port would
    // pass, and the run would silently measure the wrong server.
    if (serverDied?.()) {
      throw new Error(
        `Server process exited before becoming ready (is port already in use?)`
      )
    }
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

// The death check alone is racy on a contested port: a stale server can
// answer the readiness probe before our child fails to bind, and the run
// would silently measure the wrong server.
async function assertPortFree(port: number): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)
  try {
    await fetch(`http://127.0.0.1:${port}/`, {
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    return
  } finally {
    clearTimeout(timeout)
  }
  throw new Error(
    `Port ${port} is already serving responses — another server is running. ` +
      `Stop it, pass a different --port, or use --start-server=false to ` +
      `trace against it deliberately.`
  )
}

async function gracefulKill(server: ReturnType<typeof spawn>) {
  // once('exit') never resolves for a child that already exited.
  if (server.exitCode !== null || server.signalCode !== null) return
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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  // Average the middle pair for even counts: with samples=2, taking the
  // upper-middle would report every field's worse run.
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function medianOrNull(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return median(present)
}

function medianSample(samples: TraceSample[]): TraceSample {
  const num = (pick: (s: TraceSample) => number) => median(samples.map(pick))
  const opt = (pick: (s: TraceSample) => number | null) =>
    medianOrNull(samples.map(pick))
  return {
    fcpMs: opt((s) => s.fcpMs),
    lcpMs: opt((s) => s.lcpMs),
    domContentLoadedMs: opt((s) => s.domContentLoadedMs),
    loadMs: opt((s) => s.loadMs),
    hydratedMs: opt((s) => s.hydratedMs),
    evalChunksMs: num((s) => s.evalChunksMs),
    evalChunkCount: num((s) => s.evalChunkCount),
    evalInlineMs: num((s) => s.evalInlineMs),
    evalInlineCount: num((s) => s.evalInlineCount),
    compileMs: num((s) => s.compileMs),
    parseBackgroundMs: num((s) => s.parseBackgroundMs),
    gcMs: num((s) => s.gcMs),
    longTasksToHydrated: opt((s) => s.longTasksToHydrated),
    blockingTimeToHydratedMs: opt((s) => s.blockingTimeToHydratedMs),
    jsTransferBytes: num((s) => s.jsTransferBytes),
    jsParsedBytes: num((s) => s.jsParsedBytes),
    jsFileCount: num((s) => s.jsFileCount),
  }
}

function analyzeTrace(
  events: TraceEvent[],
  pageUrl: string,
  resourceInfo: {
    transferBytes: number
    parsedBytes: number
    fileCount: number
  }
): TraceSample {
  // Trace event arrays are not guaranteed timestamp-ordered (per-thread
  // buffers flush independently), so sort before any first/last lookup.
  const sorted = [...events].sort((a, b) => a.ts - b.ts)

  // The main-thread pid/tid pair is identified by the navigationStart
  // user-timing event for our document; main-thread buckets filter on it
  // so worker/compositor/browser-process events never pollute the sums.
  const navStart = sorted.findLast(
    (event) =>
      event.name === 'navigationStart' &&
      event.cat.includes('blink.user_timing') &&
      event.args?.data?.documentLoaderURL?.startsWith(pageUrl.split('?')[0])
  )
  if (!navStart) {
    throw new Error(`Trace has no navigationStart for ${pageUrl}`)
  }
  const { pid, tid, ts: navTs } = navStart
  // Redirects (e.g. trailingSlash) can make the final document URL differ
  // from the requested URL; inline-script eval events carry the former.
  const documentUrl = navStart.args?.data?.documentLoaderURL ?? pageUrl

  const onMain = (event: TraceEvent) =>
    event.pid === pid && event.tid === tid && event.ts >= navTs
  const relMs = (ts: number) => (ts - navTs) / 1000

  const firstInstant = (name: string): number | null => {
    const event = sorted.find((e) => e.name === name && onMain(e))
    return event ? relMs(event.ts) : null
  }
  const lastInstant = (name: string): number | null => {
    const event = sorted.findLast((e) => e.name === name && onMain(e))
    return event ? relMs(event.ts) : null
  }

  const hydratedEvent = sorted.find(
    (e) => e.name === 'bench:hydrated' && onMain(e)
  )
  const hydratedTs = hydratedEvent?.ts ?? null

  let evalChunksMs = 0
  let evalInlineMs = 0
  let evalInlineCount = 0
  let compileMs = 0
  let parseBackgroundMs = 0
  let gcMs = 0
  let longTasksToHydrated = 0
  let blockingTimeToHydratedMs = 0
  const chunkUrls = new Set<string>()

  for (const event of sorted) {
    if (event.ph !== 'X' || !event.dur || event.ts < navTs) continue
    const durMs = event.dur / 1000

    // Script streaming parses large external scripts on background
    // threads of the same renderer process. Sum the nested *Parsing
    // events (actual parse CPU), not the enclosing v8.parseOnBackground,
    // whose wall time is mostly waiting on network bytes.
    if (event.name === 'v8.parseOnBackgroundParsing' && event.pid === pid) {
      parseBackgroundMs += durMs
      continue
    }

    if (event.pid !== pid || event.tid !== tid) continue

    if (event.name === 'EvaluateScript') {
      const url = event.args?.data?.url ?? ''
      if (url.includes('/_next/static/')) {
        evalChunksMs += durMs
        chunkUrls.add(url)
      } else if (url === documentUrl) {
        // Inline scripts carry the document URL. Evals with no URL are
        // excluded: those are the harness's own waitForFunction/evaluate
        // calls, not page work. This bucket mixes `self.__next_f.push`
        // Flight scripts with Fizz's tiny `$RS`/`$RC` boundary-reveal
        // scripts; the trace does not expose script contents, but Flight
        // pushes dominate duration.
        evalInlineMs += durMs
        evalInlineCount++
      }
    } else if (event.name === 'v8.compile') {
      compileMs += durMs
    } else if (event.name === 'MinorGC' || event.name === 'MajorGC') {
      // Only the top-level pause events: the 'v8' category also emits
      // nested V8.GC_* sub-phase events for the same pauses, and summing
      // those would multi-count GC time.
      gcMs += durMs
    } else if (event.name === 'RunTask' && hydratedTs !== null) {
      // Count only the pre-hydration portion of the task: the task that
      // commits hydration typically keeps running afterwards, and its
      // tail is post-hydration work.
      const clippedMs =
        (Math.min(event.ts + event.dur, hydratedTs) - event.ts) / 1000
      if (clippedMs > 50) {
        longTasksToHydrated++
        blockingTimeToHydratedMs += clippedMs - 50
      }
    }
  }

  return {
    fcpMs: firstInstant('firstContentfulPaint'),
    lcpMs: lastInstant('largestContentfulPaint::Candidate'),
    domContentLoadedMs: firstInstant('MarkDOMContent'),
    loadMs: firstInstant('MarkLoad'),
    hydratedMs: hydratedTs !== null ? relMs(hydratedTs) : null,
    evalChunksMs,
    evalChunkCount: chunkUrls.size,
    evalInlineMs,
    evalInlineCount,
    compileMs,
    parseBackgroundMs,
    gcMs,
    longTasksToHydrated: hydratedTs !== null ? longTasksToHydrated : null,
    blockingTimeToHydratedMs:
      hydratedTs !== null ? blockingTimeToHydratedMs : null,
    jsTransferBytes: resourceInfo.transferBytes,
    jsParsedBytes: resourceInfo.parsedBytes,
    jsFileCount: resourceInfo.fileCount,
  }
}

async function traceRoute(
  browser: Browser,
  options: CliOptions,
  route: string
): Promise<RouteTraceResult | null> {
  const url = `http://127.0.0.1:${options.port}${route}`
  const samples: TraceSample[] = []

  for (let i = 0; i < options.samples; i++) {
    // Fresh context per sample: no HTTP cache or compile cache reuse, so
    // every sample is a cold visit.
    const context = await browser.newContext()
    const page: Page = await context.newPage()
    let tracing = false
    try {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: options.cpuThrottle,
      })

      await browser.startTracing(page, {
        screenshots: false,
        categories: TRACE_CATEGORIES,
      })
      tracing = true

      await page.goto(url, {
        waitUntil: 'load',
        timeout: options.timeoutMs,
      })
      await page
        .waitForFunction(
          () => performance.getEntriesByName('bench:hydrated').length > 0,
          undefined,
          { timeout: options.timeoutMs }
        )
        .catch(() => {
          console.warn(
            `[client-trace] ${route}: bench:hydrated mark not observed (sample ${i + 1})`
          )
        })
      await page.waitForTimeout(options.settleMs)

      const resourceInfo = await page.evaluate(() => {
        const entries = performance
          .getEntriesByType('resource')
          .filter(
            (entry) =>
              entry.name.includes('/_next/static/') &&
              new URL(entry.name).pathname.endsWith('.js')
          ) as PerformanceResourceTiming[]
        return {
          transferBytes: entries.reduce((s, e) => s + e.transferSize, 0),
          parsedBytes: entries.reduce((s, e) => s + e.decodedBodySize, 0),
          fileCount: entries.length,
        }
      })

      const traceBuffer = await browser.stopTracing()
      tracing = false
      if (i === 0) {
        const slug = route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root'
        await writeFile(
          resolve(options.artifactDir, `client-trace-${slug}.json`),
          traceBuffer
        )
      }

      const parsed = JSON.parse(traceBuffer.toString('utf8'))
      const events: TraceEvent[] = Array.isArray(parsed)
        ? parsed
        : parsed.traceEvents
      samples.push(analyzeTrace(events, url, resourceInfo))
    } catch (error) {
      // A failed sample (navigation timeout, CDP error) should cost one
      // sample, not the whole run's collected results.
      console.warn(
        `[client-trace] ${route}: sample ${i + 1} failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    } finally {
      if (tracing) {
        // Tracing survives context.close(); the next startTracing would
        // fail if a trace is still active.
        await browser.stopTracing().catch(() => undefined)
      }
      await context.close()
    }
  }

  if (samples.length === 0) {
    console.warn(`[client-trace] ${route}: all samples failed, skipping route`)
    return null
  }
  return { route, samples, median: medianSample(samples) }
}

function formatMs(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(0)}ms`
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`
}

function printResults(options: CliOptions, results: RouteTraceResult[]) {
  console.log(
    `\nCLIENT TRACE (samples=${options.samples}, cpuThrottle=${options.cpuThrottle}x, cold visit per sample)`
  )
  for (const { route, median: m } of results) {
    console.log(`\n  Route: ${route}`)
    console.log(
      `    milestones  FCP=${formatMs(m.fcpMs)} LCP=${formatMs(m.lcpMs)} DCL=${formatMs(m.domContentLoadedMs)} load=${formatMs(m.loadMs)} hydrated=${formatMs(m.hydratedMs)}`
    )
    console.log(
      `    main thread eval-chunks=${m.evalChunksMs.toFixed(1)}ms (${m.evalChunkCount} files) eval-inline=${m.evalInlineMs.toFixed(1)}ms (${m.evalInlineCount} scripts) compile=${m.compileMs.toFixed(1)}ms gc=${m.gcMs.toFixed(1)}ms`
    )
    console.log(
      `    off thread  parse-background=${m.parseBackgroundMs.toFixed(1)}ms`
    )
    console.log(
      `    blocking    longTasks(pre-hydration)=${m.longTasksToHydrated ?? 'n/a'} tbt=${m.blockingTimeToHydratedMs === null ? 'n/a' : `${m.blockingTimeToHydratedMs.toFixed(1)}ms`}`
    )
    console.log(
      `    js          ${formatKb(m.jsTransferBytes)} transferred / ${formatKb(m.jsParsedBytes)} parsed (${m.jsFileCount} files)`
    )
  }
}

async function main() {
  const options = parseCli()

  try {
    await access(NEXT_BIN)
  } catch {
    throw new Error(
      `Missing ${NEXT_BIN}. Build Next.js first (pnpm --filter=next build).`
    )
  }

  await mkdir(options.artifactDir, { recursive: true })

  if (options.build) {
    const generator = resolve(
      options.appDir,
      'scripts/generate-client-graph.mjs'
    )
    if (existsSync(generator)) {
      await runCommand('node', [generator], options.appDir)
    }
    console.log('[client-trace] building app fixture...')
    await runCommand('node', [NEXT_BIN, 'build'], options.appDir)
  }

  let server: ReturnType<typeof spawn> | null = null
  let browser: Browser | null = null
  try {
    if (options.startServer) {
      console.log('[client-trace] starting production server (next start)...')
      await assertPortFree(options.port)
      server = spawn(
        'node',
        [NEXT_BIN, 'start', '--port', String(options.port)],
        {
          cwd: options.appDir,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            NEXT_TELEMETRY_DISABLED: '1',
          },
          stdio: 'ignore',
        }
      )
    }
    await waitForServerReady(
      `http://127.0.0.1:${options.port}${options.routes[0]}`,
      options.timeoutMs,
      () =>
        server !== null &&
        (server.exitCode !== null || server.signalCode !== null)
    )

    browser = await chromium.launch()

    const results: RouteTraceResult[] = []
    for (const route of options.routes) {
      console.log(`[client-trace] route ${route}: ${options.samples} samples`)
      const result = await traceRoute(browser, options, route)
      if (result) results.push(result)
    }

    printResults(options, results)

    const report = {
      options,
      results,
      generatedAt: new Date().toISOString(),
      node: process.version,
    }
    const reportPath = resolve(options.artifactDir, 'client-trace.json')
    await writeFile(reportPath, JSON.stringify(report, null, 2))
    console.log(`\nWrote JSON report: ${reportPath}`)
    if (options.jsonOut) {
      await writeFile(
        resolve(process.cwd(), options.jsonOut),
        JSON.stringify(report, null, 2)
      )
    }
  } finally {
    if (browser) await browser.close()
    if (server) await gracefulKill(server)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

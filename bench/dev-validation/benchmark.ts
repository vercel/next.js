// Dev-validation benchmark. Must be run with tsx (via `pnpm
// bench:dev-validation`).
//
// Measures how much dev-mode Cache Components validation contends for the dev
// server's event loop during rapid navigation, and how much running it on a
// worker thread (`experimental.devValidationWorker`) relieves that.
//
// Workload: for each route family (client / server / sprite) Playwright clicks
// the family's `<Link>` repeatedly. Navigating to the current route re-renders
// and re-validates it, so every click triggers a fresh dev validation (the
// reloop "click Overview repeatedly" case). The routes carry no `instant`
// config; dev validation applies to page segments by default.
//
// Signal: the browser-observed request latency of those navigations, taken from
// Playwright's own network timing (`request.timing()`). We use TTFB
// (`responseStart - requestStart`) because that is the time the browser waits
// for the server, which includes the event-loop queue wait while validation
// monopolizes the loop. The CLI's logged request durations are NOT usable for
// this: the dev server starts that clock inside the request handler (after the
// event loop has already yielded to the request), so the queue wait is
// invisible to it.
//
// By default it runs the A/B on the same build: validation on a worker thread
// (the default) vs in-process (`experimental.devValidationWorker: false`), and
// prints each configuration's absolute TTFB side by side (not a ratio). Pass
// `--worker=true|false` to run a single configuration.
//
// The clicks are back-to-back, so this is a worst case: navigations that land
// inside the validation window, where the in-process path makes them wait for
// the current validation render to finish. The time the worker frees is that
// render's CPU, which is bounded, route-dependent, and does no IO, so it does
// not scale with total request time and largely disappears at human click
// speed. Read these numbers (especially the `max` tail) as an upper bound on a
// dev-only responsiveness gain, not a speedup that generalizes to real apps.

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { FAMILIES, familyHref } from './app/families'

const APP_DIR = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(APP_DIR, '..', '..')
const NEXT_BIN = resolve(REPO_ROOT, 'packages/next/dist/bin/next')
const GENERATE = resolve(APP_DIR, 'scripts', 'generate.mjs')

type Stats = {
  n: number
  p50: number
  p95: number
  max: number
  mean: number
}

type FamilyResult = {
  family: string
  ttfb: Stats
  total: Stats
}

type RunResult = {
  worker: boolean
  families: FamilyResult[]
}

type CliOptions = {
  compare: boolean
  worker: boolean
  bundler: 'turbopack' | 'webpack'
  clicks: number
  port: number
  headless: boolean
  settleMs: number
  jsonOut?: string
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    compare: true,
    worker: true,
    bundler: 'turbopack',
    clicks: 48,
    port: 3210,
    headless: true,
    settleMs: 3000,
  }
  for (const arg of argv) {
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=')
    const value = rawValue ?? 'true'
    switch (rawKey) {
      case 'compare':
        opts.compare = value !== 'false'
        break
      case 'worker':
        // A single explicit --worker run turns off the A/B comparison.
        opts.worker = value !== 'false'
        opts.compare = false
        break
      case 'bundler':
        opts.bundler = value === 'webpack' ? 'webpack' : 'turbopack'
        break
      case 'clicks':
        opts.clicks = Number(value)
        break
      case 'port':
        opts.port = Number(value)
        break
      case 'headless':
        opts.headless = value !== 'false'
        break
      case 'settle-ms':
        opts.settleMs = Number(value)
        break
      case 'json-out':
        opts.jsonOut = value
        break
      default:
        throw new Error(`Unknown option: --${rawKey}`)
    }
  }
  return opts
}

function stats(samples: number[]): Stats {
  if (samples.length === 0) {
    return { n: 0, p50: NaN, p95: NaN, max: NaN, mean: NaN }
  }
  const sorted = [...samples].sort((a, b) => a - b)
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  return {
    n: sorted.length,
    p50: Math.round(at(50)),
    p95: Math.round(at(95)),
    max: Math.round(sorted[sorted.length - 1]),
    mean: Math.round(mean),
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} exited with ${code}`))
    )
  })
}

async function waitForReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/`)
      await res.text()
      if (res.status < 500) {
        return
      }
    } catch {
      // Server not up yet.
    }
    await sleep(500)
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`)
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) {
    return
  }
  const exited = new Promise<void>((resolvePromise) =>
    server.once('exit', () => resolvePromise())
  )
  server.kill('SIGTERM')
  const killed = await Promise.race([
    exited.then(() => true),
    sleep(5000).then(() => false),
  ])
  if (!killed) {
    server.kill('SIGKILL')
    await exited
  }
}

async function measureFamily(
  page: Page,
  family: string,
  opts: CliOptions
): Promise<FamilyResult> {
  const routePath = familyHref(family)
  const linkSel = `nav a[data-nav="${family}"]`

  // Fire the family's link and resolve once its RSC navigation request has come
  // back, so clicks stay one-per-navigation and measurable.
  const clickOnce = async () => {
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes(routePath) && r.request().method() === 'GET',
        { timeout: 60_000 }
      ),
      page.click(linkSel),
    ])
  }

  // Collect Playwright's own network timing for the family's navigation
  // requests while measuring. TTFB (responseStart - requestStart) is the
  // browser-observed server wait; total (responseEnd - requestStart) adds the
  // response transfer.
  const ttfb: number[] = []
  const total: number[] = []
  let collecting = false
  const onRequestFinished = (request: import('playwright').Request) => {
    if (!collecting) {
      return
    }
    if (request.method() !== 'GET' || !request.url().includes(routePath)) {
      return
    }
    const timing = request.timing()
    if (timing.requestStart >= 0 && timing.responseStart >= 0) {
      ttfb.push(timing.responseStart - timing.requestStart)
      total.push(timing.responseEnd - timing.requestStart)
    }
  }
  page.on('requestfinished', onRequestFinished)

  collecting = true
  for (let i = 0; i < opts.clicks; i++) {
    await clickOnce()
  }
  collecting = false
  page.off('requestfinished', onRequestFinished)

  return {
    family,
    ttfb: stats(ttfb),
    total: stats(total),
  }
}

async function runOnce(worker: boolean, opts: CliOptions): Promise<RunResult> {
  const label = worker ? 'worker' : 'in-process'
  process.stdout.write(`\n=== booting dev server: ${label} ===\n`)

  const server = spawn(
    'node',
    [
      NEXT_BIN,
      'dev',
      opts.bundler === 'webpack' ? '--webpack' : '--turbopack',
      '--port',
      String(opts.port),
    ],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NO_COLOR: '1',
        ...(worker ? {} : { BENCH_DEV_VALIDATION_WORKER: 'false' }),
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    }
  )

  let browser: Browser | undefined
  try {
    await waitForReady(opts.port, 180_000)
    const base = `http://localhost:${opts.port}`

    browser = await chromium.launch({ headless: opts.headless })
    const page = await browser.newPage()
    await page.goto(base, { waitUntil: 'load' })
    await page.waitForSelector(`nav a[data-nav="${FAMILIES[0]}"]`)

    // Warm every route once (compile) and let the warmup-triggered validation
    // settle, so the measured clicks reflect steady-state contention, not
    // first-compile cost.
    process.stdout.write('warming up routes...\n')
    for (const family of FAMILIES) {
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().includes(familyHref(family)) &&
            r.request().method() === 'GET',
          { timeout: 180_000 }
        ),
        page.click(`nav a[data-nav="${family}"]`),
      ])
    }
    await sleep(opts.settleMs)

    const families: FamilyResult[] = []
    for (const family of FAMILIES) {
      process.stdout.write(`measuring ${family} (${opts.clicks} clicks)...\n`)
      families.push(await measureFamily(page, family, opts))
    }

    return { worker, families }
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
    await stopServer(server)
    // Give the OS a moment to release the port before the next configuration.
    await sleep(1000)
  }
}

function formatStats(stat: Stats): string {
  return `p50=${stat.p50}ms p95=${stat.p95}ms max=${stat.max}ms (n=${stat.n})`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  process.stdout.write('generating fixture...\n')
  await run('node', [GENERATE])

  const configs = opts.compare ? [true, false] : [opts.worker]
  const results: RunResult[] = []
  for (const worker of configs) {
    results.push(await runOnce(worker, opts))
  }

  process.stdout.write(
    '\n=== RESULTS (browser-observed TTFB, lower is better) ===\n'
  )
  for (const result of results) {
    const label = result.worker ? 'worker' : 'in-process'
    process.stdout.write(`${label}:\n`)
    for (const family of result.families) {
      process.stdout.write(
        `  ${family.family.padEnd(6)} ttfb ${formatStats(family.ttfb)}\n`
      )
    }
  }

  if (opts.compare) {
    const off = results.find((r) => r.worker)
    const inProc = results.find((r) => !r.worker)
    if (off && inProc) {
      // Report absolute TTFB side by side rather than a ratio. A ratio
      // overstates the win: the time the worker frees is the validation
      // render's CPU, which is bounded and route-dependent, and it only shows
      // up when a navigation lands in the validation window. The tail (`max`)
      // is the honest headline: it is the main-thread stall the worker removes.
      process.stdout.write(
        '\n=== in-process vs worker, browser-observed TTFB (ms, lower is better) ===\n'
      )
      for (const family of FAMILIES) {
        const o = off.families.find((f) => f.family === family)
        const p = inProc.families.find((f) => f.family === family)
        if (o && p) {
          process.stdout.write(
            `  ${family.padEnd(6)} in-process ${formatStats(p.ttfb)}\n` +
              `  ${' '.repeat(6)} worker     ${formatStats(o.ttfb)}\n`
          )
        }
      }
    }
  }

  if (opts.jsonOut) {
    await mkdir(resolve(opts.jsonOut, '..'), { recursive: true })
    await writeFile(
      opts.jsonOut,
      JSON.stringify({ options: opts, results }, null, 2)
    )
    process.stdout.write(`\nwrote ${opts.jsonOut}\n`)
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

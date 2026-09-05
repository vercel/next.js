/**
 * Server Action dispatches from one client are SERIALIZED — Promise.all
 * doesn't parallelize them (Next.js 16.4.0-canary.10, verified 2026-08)
 *
 * Target semantic: Server Actions invoked from a single browser client go
 * through the client-side action queue, which dispatches them one at a time
 * regardless of how the calls are composed on the client. Spiked empirically
 * on this canary with two 1000ms actions behind one button (production
 * build + next start, headless Chromium):
 *   - sequential awaits (pristine):        ~2045ms elapsed, ~-10ms overlap
 *   - Promise.all([a(), b()]) (the trap):  ~2045ms elapsed, ~-10ms overlap
 *     (zero server-side overlap — the second POST leaves only after the
 *     first action's response lands)
 *   - one action, server-side Promise.all: ~1048ms elapsed, ~+1005ms overlap
 *   - route handler + fetch:                ~1s, full overlap (fetches are
 *     not queued — only action dispatches are)
 *
 * FALSE BELIEF this eval targets: "Server Actions are RPC-like fetches, so
 * Promise.all on the client runs them in parallel." The wrong path compiles,
 * works, returns both results — and stays ~2s. There is no breadcrumb: no
 * .d.ts/config mention of the queue, curl shows the server handling
 * concurrent POSTs concurrently, and the one adjacent config surface
 * (experimental.concurrentRouterQueue) is a stub that throws "Not
 * implemented" at runtime. The correct fixes have no greppable name: merge
 * the work into ONE server function (Promise.all on the server), or move the
 * calls to route handler(s) invoked via fetch. Both are accepted here.
 *
 * Why agents fail: they rewrite the two awaits as Promise.all, see it build
 * and run, and trust it — client-measured elapsed time is the only local
 * symptom, and agents rarely drive a browser mid-task to measure it.
 *
 * This EVAL verifies behavior in a real headless browser: it measures
 * button-click-to-result latency itself (EVAL's own clock, not the app's),
 * and cross-checks server-side parallelism via the frozen audit log that
 * lib/sync-core.ts appends to data/sync-log.ndjson.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4079
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const DATA_DIR = join(ROOT, 'data')
const LOG_FILE = join(DATA_DIR, 'sync-log.ndjson')

// The EVAL rewrites both data files with record counts the shipped fixture
// never used, so results hardcoded from the shipped data (12/8) cannot pass:
// the displayed numbers must be derived server-side at click time.
const INVENTORY_COUNT = 17
const PRICING_COUNT = 6

function inventoryJson(): string {
  const records = Array.from({ length: INVENTORY_COUNT }, (_, i) => ({
    sku: `INV-${2000 + i}`,
    qty: ((i + 3) * 13) % 97,
  }))
  return JSON.stringify({ records }, null, 2) + '\n'
}

function pricingJson(): string {
  const records = Array.from({ length: PRICING_COUNT }, (_, i) => ({
    sku: `INV-${2000 + i}`,
    price: Math.round(((i + 2) * 7.37) * 100) / 100,
  }))
  return JSON.stringify({ records }, null, 2) + '\n'
}

// ---------------------------------------------------------------------------
// Source scanning helpers
// ---------------------------------------------------------------------------

function sourceFiles(): string[] {
  const out: string[] = []
  // __agent_eval__ is the harness's own in-sandbox runtime dir, injected
  // post-agent — it must be excluded from every recursive scan.
  const skipDirs = new Set([
    'node_modules',
    '.next',
    '.git',
    'data',
    '__agent_eval__',
  ])
  const entries = readdirSync(ROOT, { recursive: true, withFileTypes: true })
  for (const d of entries) {
    if (!d.isFile()) continue
    const parent = (d as { parentPath?: string }).parentPath ?? (d as any).path
    const p = join(parent, d.name)
    const rel = p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p
    const segments = rel.split('/')
    if (segments.some((s) => skipDirs.has(s))) continue
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(d.name)) continue
    if (/^EVAL(\.test)?\.(ts|js)$/.test(d.name)) continue
    if (d.name.endsWith('.d.ts')) continue
    out.push(p)
  }
  return out
}

function read(p: string): string {
  return readFileSync(p, 'utf8')
}

/** Removes // and /* *\/ comments; keeps string literals intact. */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c
      out += c
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i]
          i++
        }
        if (i < src.length) {
          out += src[i]
          i++
        }
      }
      out += quote
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Audit log (written by the frozen lib/sync-core.ts)
// ---------------------------------------------------------------------------

interface LogEntry {
  system?: string
  phase?: string
  ts?: number
}

function logEntries(): LogEntry[] {
  if (!existsSync(LOG_FILE)) return []
  return readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry
      } catch {
        return null
      }
    })
    .filter((e): e is LogEntry => e !== null)
}

function syncWindow(
  entries: LogEntry[],
  system: string
): { start: number | undefined; end: number | undefined } {
  return {
    start: entries.find((e) => e.system === system && e.phase === 'start')?.ts,
    end: entries.find((e) => e.system === system && e.phase === 'end')?.ts,
  }
}

// ---------------------------------------------------------------------------
// Production server
// ---------------------------------------------------------------------------

let server: ChildProcess | undefined
let serverOutput = ''

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

async function portAnswers(): Promise<boolean> {
  try {
    await fetch(BASE + '/', { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Headless browser: full puppeteer locally, puppeteer-core + sparticuz in the
// sandbox (mechanism proven in-sandbox by the b9 infrastructure spike).
// ---------------------------------------------------------------------------

interface Page {
  goto(url: string, opts?: unknown): Promise<unknown>
  waitForSelector(sel: string, opts?: unknown): Promise<unknown>
  waitForFunction(
    fn: (...args: any[]) => unknown,
    opts?: unknown,
    ...args: any[]
  ): Promise<unknown>
  click(sel: string): Promise<void>
  $eval(sel: string, fn: (el: Element) => string | null): Promise<string | null>
  close(): Promise<void>
}

interface Browser {
  newPage(): Promise<Page>
  close(): Promise<void>
}

const nodeRequire =
  typeof require === 'function' ? require : createRequire(import.meta.url)

let browser: Browser | undefined

async function launchBrowser(): Promise<Browser> {
  // (a) local: the fixture's node_modules carries full puppeteer.
  try {
    const puppeteer = nodeRequire('puppeteer')
    return (await puppeteer.launch({ headless: true })) as Browser
  } catch {
    // fall through to the sandbox mechanism
  }

  // (b) sandbox: puppeteer-core + @sparticuz/chromium. sparticuz only wires
  // its bundled NSS libs into LD_LIBRARY_PATH when it believes it's on
  // Lambda — masquerade before requiring.
  process.env.AWS_EXECUTION_ENV ??= 'AWS_Lambda_nodejs24.x'
  process.env.AWS_LAMBDA_FUNCTION_NAME ??= 'eval'
  execSync('npm install --no-save puppeteer-core @sparticuz/chromium', {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 300_000,
  })
  // ESM-interop: the package may surface its API under `.default`.
  const mod = nodeRequire('@sparticuz/chromium')
  const chromium = mod?.default ?? mod
  const puppeteer = nodeRequire('puppeteer-core')
  const exe =
    typeof chromium.executablePath === 'function'
      ? await chromium.executablePath()
      : await chromium.executablePath
  // Belt-and-braces: locate the extracted bundled libs and wire them in
  // ourselves in case sparticuz's Lambda path didn't.
  try {
    const found = execSync(
      "find /tmp -maxdepth 3 -name 'libnss3.so' 2>/dev/null | head -1"
    )
      .toString()
      .trim()
    const dir = found.replace(/\/libnss3\.so$/, '')
    if (dir) {
      process.env.LD_LIBRARY_PATH = `${dir}:${process.env.LD_LIBRARY_PATH ?? ''}`
    }
  } catch {}
  return (await puppeteer.launch({
    args: chromium.args ?? ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: exe,
    headless: chromium.headless ?? true,
  })) as Browser
}

// ---------------------------------------------------------------------------
// Trials: EVAL clicks the button and measures with its OWN clock
// ---------------------------------------------------------------------------

interface Trial {
  evalElapsedMs: number
  resultText: string
  renderedElapsedText: string | null
  entries: LogEntry[]
}

const trials: Trial[] = []
const trialFailures: string[] = []

async function runTrial(): Promise<Trial | null> {
  if (!browser) throw new Error('browser did not launch')
  const page = await browser.newPage()
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('[data-testid="sync-button"]', {
      timeout: 15_000,
    })
    const before = logEntries().length
    const t0 = Date.now()
    await page.click('[data-testid="sync-button"]')
    try {
      await page.waitForFunction(
        (inv: number, pri: number) => {
          const el = document.querySelector('[data-testid="sync-result"]')
          if (!el) return false
          const text = el.textContent ?? ''
          return (
            new RegExp(`(^|\\D)${inv}(\\D|$)`).test(text) &&
            new RegExp(`(^|\\D)${pri}(\\D|$)`).test(text)
          )
        },
        { timeout: 20_000, polling: 25 },
        INVENTORY_COUNT,
        PRICING_COUNT
      )
    } catch (err) {
      trialFailures.push(
        `sync-result never showed both fresh counts (${INVENTORY_COUNT} and ${PRICING_COUNT}): ${
          (err as Error).message
        }`
      )
      return null
    }
    const evalElapsedMs = Date.now() - t0
    const resultText =
      (await page.$eval(
        '[data-testid="sync-result"]',
        (el) => el.textContent
      )) ?? ''
    let renderedElapsedText: string | null = null
    try {
      await page.waitForSelector('[data-testid="sync-elapsed"]', {
        timeout: 3_000,
      })
      renderedElapsedText = await page.$eval(
        '[data-testid="sync-elapsed"]',
        (el) => el.textContent
      )
    } catch {}
    const entries = logEntries().slice(before)
    return { evalElapsedMs, resultText, renderedElapsedText, entries }
  } finally {
    await page.close()
  }
}

function bestTrial(): Trial {
  if (trials.length === 0) {
    throw new Error(
      `no successful trial: clicking the sync button never produced both result numbers.\n` +
        `failures: ${trialFailures.join(' | ')}\nserver output:\n${serverOutput.slice(-2000)}`
    )
  }
  return trials.reduce((a, b) => (b.evalElapsedMs < a.evalElapsedMs ? b : a))
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Fresh vendor data (counts the agent never saw) and an empty audit log.
  writeFileSync(join(DATA_DIR, 'inventory.json'), inventoryJson())
  writeFileSync(join(DATA_DIR, 'pricing.json'), pricingJson())
  writeFileSync(LOG_FILE, '')

  if (await portAnswers()) {
    throw new Error(
      `Something already answers on port ${PORT}; refusing to run against an unknown server.`
    )
  }

  rmSync(join(ROOT, '.next'), { recursive: true, force: true })
  try {
    execSync('node node_modules/next/dist/bin/next build', {
      cwd: ROOT,
      stdio: 'pipe',
      env: cleanEnv(),
      timeout: 600_000,
    })
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer }
    throw new Error(
      `next build failed:\n${e.stdout?.toString() ?? ''}\n${e.stderr?.toString() ?? ''}`
    )
  }

  server = spawn(
    'node',
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    {
      cwd: ROOT,
      env: cleanEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }
  )
  server.stdout?.on('data', (d) => (serverOutput += String(d)))
  server.stderr?.on('data', (d) => (serverOutput += String(d)))

  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      const res = await fetch(BASE + '/', { signal: AbortSignal.timeout(1000) })
      if (res.ok) break
    } catch {}
    if (Date.now() > deadline) {
      throw new Error(`next start never became ready:\n${serverOutput}`)
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  browser = await launchBrowser()
}, 850_000)

afterAll(async () => {
  try {
    await browser?.close()
  } catch {}
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      try {
        server.kill('SIGKILL')
      } catch {}
    }
  }
})

// ---------------------------------------------------------------------------
// A. The button finishes in about one second (EVAL-measured, in a browser)
// ---------------------------------------------------------------------------

test(
  'clicking Sync shows both fresh result numbers in about one second',
  async () => {
    for (let i = 0; i < 3; i++) {
      const trial = await runTrial()
      if (trial) trials.push(trial)
    }
    const best = bestTrial()
    const allElapsed = trials.map((t) => t.evalElapsedMs).join(', ')

    // Both counts must be the values derived from the data the EVAL wrote.
    expect(best.resultText).toMatch(
      new RegExp(`(^|\\D)${INVENTORY_COUNT}(\\D|$)`)
    )
    expect(best.resultText).toMatch(new RegExp(`(^|\\D)${PRICING_COUNT}(\\D|$)`))

    // The two 1000ms vendor syncs bound the click from below: a result that
    // appears faster than one vendor sync means the numbers were shown
    // without waiting for the server-side work.
    expect(
      best.evalElapsedMs,
      `result appeared before a single vendor sync could complete (trials: ${allElapsed}ms)`
    ).toBeGreaterThan(900)

    // ...and from above: the two independent syncs must not run one after
    // the other. Sequential dispatch measures ~2050ms; parallel ~1050ms.
    expect(
      best.evalElapsedMs,
      `the button still takes two vendor syncs' worth of time (trials: ${allElapsed}ms)`
    ).toBeLessThan(1600)

    // Secondary: the panel's own elapsed display (kept per the task) should
    // agree — tolerated unless it plainly reports a serialized run.
    expect(
      best.renderedElapsedText,
      'the sync-elapsed testid disappeared from the panel'
    ).toBeTruthy()
    const rendered = Number(
      (best.renderedElapsedText ?? '').match(/\d+(?:\.\d+)?/)?.[0] ?? NaN
    )
    if (Number.isFinite(rendered) && rendered >= 100) {
      expect(
        rendered,
        `the panel itself reports ${rendered}ms for the click`
      ).toBeLessThan(1600)
    }
  },
  180_000
)

// ---------------------------------------------------------------------------
// B. Server-side evidence: the two vendor syncs actually overlap
// ---------------------------------------------------------------------------

test('the two vendor syncs overlap on the server during one click', () => {
  const best = bestTrial()
  const inv = syncWindow(best.entries, 'inventory')
  const pri = syncWindow(best.entries, 'pricing')
  expect(
    inv.start !== undefined && inv.end !== undefined,
    `no complete inventory sync window in the click's audit-log slice: ${JSON.stringify(best.entries)}`
  ).toBe(true)
  expect(
    pri.start !== undefined && pri.end !== undefined,
    `no complete pricing sync window in the click's audit-log slice: ${JSON.stringify(best.entries)}`
  ).toBe(true)
  const overlap =
    Math.min(inv.end as number, pri.end as number) -
    Math.max(inv.start as number, pri.start as number)
  // Parallel execution overlaps ~1000ms of the two 1000ms windows; any
  // serialized dispatch (including client-side Promise.all over two server
  // calls) measures ~-10ms.
  expect(
    overlap,
    `inventory ran [${inv.start}, ${inv.end}], pricing ran [${pri.start}, ${pri.end}] — ` +
      `overlap ${overlap}ms means the syncs still executed one after the other`
  ).toBeGreaterThan(400)
})

// ---------------------------------------------------------------------------
// C. Integrity: real server-side syncs, frozen vendor client, kept contract
// ---------------------------------------------------------------------------

test('every click still runs both syncs through the vendor client', () => {
  expect(trials.length).toBeGreaterThan(0)
  for (const trial of trials) {
    for (const system of ['inventory', 'pricing']) {
      for (const phase of ['start', 'end']) {
        const hits = trial.entries.filter(
          (e) => e.system === system && e.phase === phase
        ).length
        expect(
          hits,
          `click produced no ${system}/${phase} audit line — the ${system} sync no longer goes through lib/sync-core.ts`
        ).toBeGreaterThanOrEqual(1)
      }
    }
  }
})

test('lib/sync-core.ts (the integrations-team client) is unmodified', () => {
  const FROZEN_SYNC_CORE = `
// lib/sync-core.ts — the integrations team's vendor sync client.
// DO NOT MODIFY THIS FILE. It mirrors each vendor's real end-to-end latency
// (measured from production traces) and appends one NDJSON audit line to
// data/sync-log.ndjson at the start and end of every sync so the integrations
// team can reconcile our runs against the vendors' own logs.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type SyncSystem = 'inventory' | 'pricing'

export interface SyncResult {
  ok: boolean
  system: SyncSystem
  count: number
}

const DATA_DIR = join(process.cwd(), 'data')
const LOG_FILE = join(DATA_DIR, 'sync-log.ndjson')

function audit(system: SyncSystem, phase: 'start' | 'end') {
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ system, phase, ts: Date.now() }) + '\\n'
  )
}

function vendorLatency() {
  // Each vendor's sync API takes about one second end to end.
  return new Promise((resolve) => setTimeout(resolve, 1000))
}

export async function runVendorSync(system: SyncSystem): Promise<SyncResult> {
  audit(system, 'start')
  await vendorLatency()
  const raw = readFileSync(join(DATA_DIR, \`\${system}.json\`), 'utf8')
  const parsed = JSON.parse(raw) as { records: unknown[] }
  audit(system, 'end')
  return { ok: true, system, count: parsed.records.length }
}
`
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  expect(normalize(read(join(ROOT, 'lib', 'sync-core.ts')))).toBe(
    normalize(FROZEN_SYNC_CORE)
  )
})

test('the panel is still a client component carrying the smoke-test testids', () => {
  const clientFiles = sourceFiles().filter((f) =>
    /['"]use client['"]/.test(stripComments(read(f)))
  )
  for (const id of ['sync-button', 'sync-result', 'sync-elapsed']) {
    const re = new RegExp(
      `data-testid\\s*=\\s*(?:["']${id}["']|\\{\\s*["']${id}["']\\s*\\})`
    )
    expect(
      clientFiles.some((f) => re.test(read(f))),
      `no 'use client' source file renders data-testid="${id}"`
    ).toBe(true)
  }
})

test('the syncs are still reached through a server-side entry point', () => {
  // Either flavor is a correct solution: server functions ('use server' —
  // one merged action or several), or route handlers called via fetch.
  const files = sourceFiles()
  const hasServerFunctions = files.some((f) =>
    /['"]use server['"]/.test(stripComments(read(f)))
  )
  const hasRouteHandler = files.some(
    (f) =>
      /(^|\/)route\.(ts|tsx|js|jsx|mjs)$/.test(f) &&
      /(^|\/)app\//.test(f.slice(ROOT.length))
  )
  const hasPagesApi = files.some((f) =>
    /(^|\/)pages\/api\//.test(f.slice(ROOT.length))
  )
  expect(hasServerFunctions || hasRouteHandler || hasPagesApi).toBe(true)
})

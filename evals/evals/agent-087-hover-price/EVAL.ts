/**
 * Hover-triggered runtime prefetch under cacheComponents needs BOTH the
 * `experimental.dynamicOnHover: true` config flag AND the
 * `unstable_dynamicOnHover` prop on the Link — each alone silently no-ops
 * (Next.js 16.4.0-canary.10, spiked 2026-08-28, production build + next
 * start, headless Chromium):
 *
 *   - pristine (default viewport prefetch): grid load fires only static
 *     prefetches (next-router-prefetch header, deduped shell), ZERO pricing
 *     computations; hover is inert; click-to-price ~874ms with one
 *     post-click pricing computation
 *   - flag + prop: hover fires ONE runtime RSC request (no
 *     next-router-prefetch header) that runs the 800ms pricing computation;
 *     click-to-price ~61ms, zero post-click computations
 *   - prop without flag: hover inert, click ~877ms + post-click computation
 *   - hand-rolled onMouseEnter={() => router.prefetch(href, { kind: 'full' })}
 *     measures the same as flag+prop (~62ms) — accepted as a legitimate
 *     alternate (any mechanism that meets the behavior passes)
 *   - prefetch={true} on the grid Links (THE trap): fires the runtime RSC
 *     request at VIEWPORT time — visible cards run pricing computations on
 *     grid load, exactly what the task forbids
 *   - cacheLife/staleTimes tuning changes nothing about the post-click fetch
 *
 * Why agents fail: zero docs pages mention dynamicOnHover; the
 * unstable_dynamicOnHover prop exists at runtime but is absent from the
 * public next/link types on this canary (adding it in a .tsx fails
 * `next build` type-checking with TS2322 — the fixture keeps the card in
 * components/deal-card.jsx so the prop builds from JS), and the habitual
 * "make clicks instant" move — prefetch={true} — violates the
 * zero-pricing-at-load constraint in a way nothing surfaces locally unless
 * a browser drives the grid while the pricing log is watched.
 *
 * This EVAL verifies behavior in a real headless browser against a
 * production server, cross-checking the frozen pricing client's NDJSON log
 * (data/pricing-log.ndjson — one line per pricing computation, appended by
 * lib/pricing-core.ts) with the page's own network traffic. Removing
 * cacheComponents cannot pass: the frozen 'use cache: private' directive
 * makes `next build` fail without it (verified).
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4089
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const LOG_FILE = join(ROOT, 'data', 'pricing-log.ndjson')

// Deal ids used by the flows. Every flow gets deals no other flow touches,
// so a server-side cache entry created by one flow can never satisfy another.
const HOVER_DEALS = ['7', '23']
const COLD_DEALS = ['41', '12']

// Mirror of the frozen pricing formula in lib/pricing-core.ts (that file is
// byte-checked below, so the formula cannot drift).
function expectedAmount(dealId: string): string {
  const n = Number.parseInt(dealId, 10) || 0
  const cents = 1900 + ((n * 137) % 6000)
  return `$${(cents / 100).toFixed(2)}`
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
    if (rel.split('/').some((s) => skipDirs.has(s))) continue
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

// ---------------------------------------------------------------------------
// Pricing log (written by the frozen lib/pricing-core.ts)
// ---------------------------------------------------------------------------

interface PricingEntry {
  dealId?: string
  ts?: number
}

function logEntries(): PricingEntry[] {
  if (!existsSync(LOG_FILE)) return []
  return readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as PricingEntry
      } catch {
        return null
      }
    })
    .filter((e): e is PricingEntry => e !== null)
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

/** lsof-only precheck: refuse to run against a port something else owns. */
function assertPortFree(): void {
  let out = ''
  try {
    out = execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN`, {
      stdio: 'pipe',
    }).toString()
  } catch {
    return // lsof exits non-zero (or is absent) when nothing listens — free
  }
  if (out.trim()) {
    throw new Error(
      `Something already listens on port ${PORT}; refusing to run against an unknown server:\n${out}`
    )
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
  hover(sel: string): Promise<void>
  bringToFront(): Promise<void>
  $eval<T>(sel: string, fn: (el: Element) => T): Promise<T>
  $$eval<T>(sel: string, fn: (els: Element[]) => T): Promise<T>
  on(event: string, cb: (arg: any) => void): void
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
// Instrumented pages: app-relevant network records + in-flight tracking
// ---------------------------------------------------------------------------

interface NetRecord {
  t: number
  path: string
  prefetchHeader: string | null
}

interface AppPage {
  page: Page
  net: NetRecord[]
  pending: Set<unknown>
}

function isAppUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return null
  if (u.pathname.startsWith('/_next/')) return null
  if (/\.(js|css|ico|map|png|jpg|svg|txt|woff2?)$/.test(u.pathname)) return null
  return u
}

async function newAppPage(): Promise<AppPage> {
  if (!browser) throw new Error('browser did not launch')
  const page = await browser.newPage()
  const net: NetRecord[] = []
  const pending = new Set<unknown>()
  page.on('request', (req: any) => {
    const u = isAppUrl(req.url())
    if (!u) return
    pending.add(req)
    net.push({
      t: Date.now(),
      path: u.pathname,
      prefetchHeader: req.headers()['next-router-prefetch'] ?? null,
    })
  })
  page.on('requestfinished', (req: any) => pending.delete(req))
  page.on('requestfailed', (req: any) => pending.delete(req))
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60_000 })
  return { page, net, pending }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Poll until no app request has been in flight for ~500ms (cap 10s). */
async function waitForNetworkQuiet(app: AppPage): Promise<void> {
  const deadline = Date.now() + 10_000
  let quiet = 0
  while (Date.now() < deadline && quiet < 5) {
    quiet = app.pending.size === 0 ? quiet + 1 : 0
    await sleep(100)
  }
}

async function waitForCardVisible(app: AppPage, dealId: string): Promise<void> {
  await app.page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel) as
        | (Element & { checkVisibility?: () => boolean })
        | null
      return !!el && (el.checkVisibility?.() ?? true)
    },
    { timeout: 15_000, polling: 100 },
    `[data-testid="deal-card-${dealId}"]`
  )
  await app.page.bringToFront()
}

async function waitForPriceVisible(page: Page, timeout: number): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="deal-price"]') as
        | (Element & { checkVisibility?: () => boolean })
        | null
      return !!el && (el.checkVisibility?.() ?? true)
    },
    { timeout, polling: 16 }
  )
}

async function readPrice(
  page: Page
): Promise<{ text: string; deal: string | null }> {
  const text = await page.$eval(
    '[data-testid="deal-price"]',
    (el) => el.textContent ?? ''
  )
  const deal = await page.$eval('[data-testid="deal-price"]', (el) =>
    el.getAttribute('data-deal')
  )
  return { text, deal }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  assertPortFree()

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

  // Reset the pricing log after the build so only server-time computations
  // are measured.
  writeFileSync(LOG_FILE, '')

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
    await sleep(250)
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
// A. Grid load + idle: the pricing service sees ZERO traffic
// ---------------------------------------------------------------------------

test(
  'loading the grid and sitting idle fires zero pricing computations and no runtime deal fetches',
  async () => {
    for (let round = 1; round <= 2; round++) {
      const before = logEntries().length
      const app = await newAppPage()
      try {
        await sleep(3000)

        if (round === 1) {
          // The grid must still be 50 real links carrying the testids.
          const cardCount = await app.page.$$eval(
            '[data-testid^="deal-card-"]',
            (els) => els.length
          )
          expect(cardCount, 'the grid no longer renders 50 deal cards').toBe(50)
          for (const dealId of [...HOVER_DEALS, ...COLD_DEALS]) {
            const card = await app.page.$eval(
              `[data-testid="deal-card-${dealId}"]`,
              (el) => ({
                tag: el.tagName,
                href: el.getAttribute('href') ?? '',
              })
            )
            expect(
              card.tag,
              `deal-card-${dealId} is no longer a real link (<a>)`
            ).toBe('A')
            expect(
              card.href.includes(`/deal/${dealId}`),
              `deal-card-${dealId} no longer points at /deal/${dealId} (href: ${card.href})`
            ).toBe(true)
          }
        }

        const computed = logEntries().slice(before)
        expect(
          computed.length,
          `grid load round ${round} ran ${computed.length} pricing computation(s) ` +
            `while idle (deals: ${computed.map((e) => e.dealId).join(', ')}) — ` +
            `the pricing service must see zero traffic until a card is hovered`
        ).toBe(0)

        const runtimeDealFetches = app.net.filter(
          (r) => /^\/deal(\/|$)/.test(r.path) && r.prefetchHeader === null
        )
        expect(
          runtimeDealFetches.length,
          `grid load round ${round} fired runtime (non-prefetch-header) deal requests ` +
            `while idle: ${JSON.stringify(runtimeDealFetches)}`
        ).toBe(0)
      } finally {
        await app.page.close()
      }
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// B/C. Hover warms exactly that deal; the click after a hover is instant
// ---------------------------------------------------------------------------

interface HoverTrial {
  dealId: string
  warmed: boolean
  warmMs: number
  clickMs: number
  postClick: PricingEntry[]
  strangers: PricingEntry[]
  priceText: string
  priceDeal: string | null
}

const hoverTrials: HoverTrial[] = []

test(
  'hovering a card warms that deal, and the click after a hover shows the price instantly with no fresh pricing computation',
  async () => {
    for (const dealId of HOVER_DEALS) {
      const app = await newAppPage()
      try {
        await waitForNetworkQuiet(app)
        const baseline = logEntries().length

        await waitForCardVisible(app, dealId)
        const h0 = Date.now()
        await app.page.hover(`[data-testid="deal-card-${dealId}"]`)

        // The hover must cause a pricing computation for this deal.
        let warmed = false
        const warmDeadline = Date.now() + 12_000
        while (Date.now() < warmDeadline) {
          if (
            logEntries()
              .slice(baseline)
              .some((e) => e.dealId === dealId)
          ) {
            warmed = true
            break
          }
          await sleep(100)
        }
        const warmMs = Date.now() - h0

        // Let the warm response land and the client cache settle.
        await waitForNetworkQuiet(app)
        await sleep(200)

        const preClick = logEntries().length
        const t0 = Date.now()
        await app.page.click(`[data-testid="deal-card-${dealId}"]`)
        await waitForPriceVisible(app.page, 15_000)
        const clickMs = Date.now() - t0

        const postClick = logEntries().slice(preClick)
        const strangers = logEntries()
          .slice(baseline)
          .filter((e) => e.dealId !== dealId)
        const price = await readPrice(app.page)
        hoverTrials.push({
          dealId,
          warmed,
          warmMs,
          clickMs,
          postClick,
          strangers,
          priceText: price.text,
          priceDeal: price.deal,
        })
      } finally {
        await app.page.close()
      }
    }

    const summary = hoverTrials
      .map(
        (t) =>
          `deal ${t.dealId}: warmed=${t.warmed} (${t.warmMs}ms), click→price ${t.clickMs}ms, ` +
          `postClick=${JSON.stringify(t.postClick)}`
      )
      .join(' | ')

    for (const t of hoverTrials) {
      expect(
        t.warmed,
        `hovering deal-card-${t.dealId} never caused a pricing computation for deal ${t.dealId} ` +
          `within 12s — hover does not warm the deal (${summary})`
      ).toBe(true)
      expect(
        t.strangers.length,
        `while warming deal ${t.dealId}, pricing computations ran for other deals ` +
          `(${t.strangers.map((e) => e.dealId).join(', ')}) — warming must be per-hovered-card, not bulk`
      ).toBe(0)
      expect(
        t.priceText.includes(expectedAmount(t.dealId)),
        `deal ${t.dealId} rendered "${t.priceText}" instead of the price ${expectedAmount(t.dealId)}`
      ).toBe(true)
      expect(
        t.priceDeal,
        `deal ${t.dealId} rendered a price computed for deal ${t.priceDeal}`
      ).toBe(t.dealId)
    }

    // Timing: judge the best of the two trials (absorbs sandbox jitter). A
    // warmed click measures ~61ms; an unwarmed one cannot beat the frozen
    // 800ms pricing latency.
    const best = hoverTrials.reduce((a, b) => (b.clickMs < a.clickMs ? b : a))
    expect(
      best.clickMs,
      `even the best post-hover click took ${best.clickMs}ms to show the price — ` +
        `the hover did not make the click instant (${summary})`
    ).toBeLessThanOrEqual(300)
    expect(
      best.postClick.length,
      `the post-hover click ran ${best.postClick.length} fresh pricing computation(s) ` +
        `(${JSON.stringify(best.postClick)}) — the price must come from the warmed data (${summary})`
    ).toBe(0)
  },
  300_000
)

// ---------------------------------------------------------------------------
// D. Control: a never-hovered card still works like today
// ---------------------------------------------------------------------------

test(
  'a cold click on a never-hovered card still shows the skeleton and then the correct price',
  async () => {
    for (const dealId of COLD_DEALS) {
      const app = await newAppPage()
      try {
        await waitForNetworkQuiet(app)
        const baseline = logEntries().length
        await waitForCardVisible(app, dealId)

        await app.page.click(`[data-testid="deal-card-${dealId}"]`)
        await app.page.waitForSelector('[data-testid="price-skeleton"]', {
          timeout: 5_000,
        })
        await waitForPriceVisible(app.page, 15_000)

        const price = await readPrice(app.page)
        expect(
          price.text.includes(expectedAmount(dealId)),
          `cold click on deal ${dealId} rendered "${price.text}" instead of ${expectedAmount(dealId)}`
        ).toBe(true)
        expect(
          price.deal,
          `cold click on deal ${dealId} rendered a price computed for deal ${price.deal}`
        ).toBe(dealId)

        const fresh = logEntries().slice(baseline)
        expect(
          fresh.some((e) => e.dealId === dealId),
          `cold click on deal ${dealId} produced no pricing computation — ` +
            `its price was warmed before the user showed intent`
        ).toBe(true)
        const strangers = fresh.filter((e) => e.dealId !== dealId)
        expect(
          strangers.length,
          `cold click on deal ${dealId} also ran pricing for other deals ` +
            `(${strangers.map((e) => e.dealId).join(', ')})`
        ).toBe(0)
      } finally {
        await app.page.close()
      }
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// E. Integrity: frozen pricing client, real links
// ---------------------------------------------------------------------------

test('lib/pricing-core.ts (the pricing team client) is unmodified', () => {
  const FROZEN_PRICING_CORE = `
// lib/pricing-core.ts — the pricing team's per-user pricing client.
// DO NOT MODIFY THIS FILE. It mirrors the pricing service's real end-to-end
// latency (measured from production traces) and appends one NDJSON line to
// data/pricing-log.ndjson for every pricing computation, so the pricing team
// can reconcile our traffic against their capacity dashboards.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheLife } from 'next/cache'

export interface DealPrice {
  dealId: string
  amount: string
}

const LOG_FILE = join(process.cwd(), 'data', 'pricing-log.ndjson')

function serviceLatency() {
  // One pricing computation takes about 800ms end to end.
  return new Promise((resolve) => setTimeout(resolve, 800))
}

export async function getUserPrice(dealId: string): Promise<DealPrice> {
  'use cache: private'
  cacheLife('minutes')
  appendFileSync(LOG_FILE, JSON.stringify({ dealId, ts: Date.now() }) + '\\n')
  await serviceLatency()
  const n = Number.parseInt(dealId, 10) || 0
  const cents = 1900 + ((n * 137) % 6000)
  return { dealId, amount: \`$\${(cents / 100).toFixed(2)}\` }
}
`
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  expect(normalize(read(join(ROOT, 'lib', 'pricing-core.ts')))).toBe(
    normalize(FROZEN_PRICING_CORE)
  )
})

test('the grid cards still go through next/link', () => {
  const importShape =
    /import\s+[^;]*?from\s*['"]next\/link['"]|require\(\s*['"]next\/link['"]\s*\)/
  expect(
    sourceFiles().some((f) => importShape.test(read(f))),
    'no source file imports next/link anymore — the grid must keep using real Links'
  ).toBe(true)
})

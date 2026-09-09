/**
 * CSS `scroll-behavior: smooth` makes the App Router's route-change scroll
 * reset ANIMATE — the intended fix is `<html data-scroll-behavior="smooth">`
 * (Next.js 16.4.0-canary.10, verified 2026-08; behavior changed in v16,
 * commit 9a6f1bd429, documented only in errors/missing-data-scroll-behavior.mdx
 * and a dev-only browser-console warning).
 *
 * Target semantic: when a site puts `scroll-behavior: smooth` on `html` (for
 * anchor links), every regular <Link> navigation's scroll-to-top is animated
 * by the browser: the viewport slowly glides from the old scroll position up
 * to the top of the new page. Next.js only suppresses the glide when the
 * developer declares the smooth behavior via `data-scroll-behavior="smooth"`
 * on <html>, which lets the router temporarily force `scroll-behavior: auto`
 * during its reset. Spiked on this canary (production build + next start,
 * headless Chromium, 900x700 viewport):
 *   - pristine (CSS smooth, no attribute): forward nav from y=5321 produced
 *     86 intermediate rAF frames and was still at y=21 ~1.45s after commit
 *   - with data-scroll-behavior="smooth": 0 intermediate frames, y=0 at the
 *     first post-commit sample (t=54ms)
 *   - TOC anchor click: ~50 intermediate frames (smooth glide) either way
 *   - pagination via <Link scroll={false}> from y=2900: stays at 2900
 *
 * FOLKLORE WRONG PATH this eval targets: a usePathname + useEffect
 * `window.scrollTo({ top: 0, behavior: 'instant' })` "scroll fix" component.
 * It passes naive testing — forward nav lands instantly and back-restore
 * still works (spike: back to y=5321) — but it fires on EVERY pathname
 * change, so it DESTROYS <Link scroll={false}> pagination: the spike
 * measured 2900 -> 0 (the reader loses their place) versus 2900 -> 2900 with
 * the attribute. Agents fall for it because the pathname-effect patch is the
 * canonical pre-v16 answer to "Next.js scrolls slowly after navigation", it
 * compiles and demos fine, and the only breadcrumb for the real fix is a
 * dev-only console warning they never see.
 *
 * All assertions are behavioral (real headless browser against a production
 * server): ANY mechanism that keeps all four behaviors — instant landing,
 * smooth TOC anchors, position-preserving pagination, back restoration — and
 * keeps navigation client-side passes.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4088
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const VIEW = { width: 900, height: 700 }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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

function pidsOnPort(): number[] {
  // lsof-only precheck: never probe the port with HTTP (another suite's
  // server must not receive traffic from this one).
  try {
    return execSync(`lsof -ti tcp:${PORT}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .split('\n')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Headless browser: full puppeteer locally, puppeteer-core + sparticuz in the
// sandbox (same dual-path mechanism as agent-079, proven in-sandbox).
// ---------------------------------------------------------------------------

interface Page {
  goto(url: string, opts?: unknown): Promise<unknown>
  goBack(opts?: unknown): Promise<unknown>
  bringToFront(): Promise<void>
  setViewport(v: { width: number; height: number }): Promise<void>
  waitForFunction(
    fn: (...args: any[]) => unknown,
    opts?: unknown,
    ...args: any[]
  ): Promise<unknown>
  click(sel: string): Promise<void>
  evaluate(fn: (...args: any[]) => unknown, ...args: any[]): Promise<any>
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

async function newPage(): Promise<Page> {
  if (!browser) throw new Error('browser did not launch')
  const page = await browser.newPage()
  await page.setViewport(VIEW)
  return page
}

// ---------------------------------------------------------------------------
// rAF scroll sampler (runs inside the page, survives client-side navigations)
// ---------------------------------------------------------------------------

interface Sample {
  t: number
  y: number
  p: string
}

async function startSampler(page: Page, durMs: number): Promise<void> {
  await page.evaluate((dur: number) => {
    const w = window as any
    w.__samples = []
    const t0 = performance.now()
    function tick() {
      w.__samples.push({
        t: Math.round(performance.now() - t0),
        y: Math.round(window.scrollY),
        p: location.pathname,
      })
      if (performance.now() - t0 < dur) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, durMs)
}

async function collectSamples(page: Page): Promise<Sample[]> {
  return ((await page.evaluate(() => (window as any).__samples ?? [])) ??
    []) as Sample[]
}

// Deterministic readiness: wait for the document load event, then for the
// framework's client router to be attached (hydration done, so link clicks
// are client-side) and the element we are about to use to be in the DOM.
// networkidle heuristics are deliberately avoided — they stall on stray
// connections and time out spuriously.
async function gotoReady(
  page: Page,
  url: string,
  requiredTestid: string
): Promise<void> {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
  await page.bringToFront()
  await page.waitForFunction(
    (id: string) =>
      Boolean((window as any).next?.router) &&
      Boolean(document.querySelector(`[data-testid="${id}"]`)),
    { timeout: 30_000 },
    requiredTestid
  )
  await sleep(400)
}

// ---------------------------------------------------------------------------
// Rendered-testid bookkeeping (runtime presence, no source scans — any
// restructuring that still renders the testids passes)
// ---------------------------------------------------------------------------

const EXPECTED_TESTIDS: Array<[where: string, ids: string[]]> = [
  [
    'the landing page',
    [
      'home-title',
      'nav-home',
      'nav-guide',
      'nav-changelog',
      'toc-link-quickstart',
      'toc-link-configuration',
      'toc-link-api',
      'toc-link-troubleshooting',
    ],
  ],
  ['the guide page', ['guide-title']],
  ['changelog page 1', ['changelog-title', 'next-page']],
  ['changelog page 2', ['prev-page']],
]

const seenTestids = new Map<string, { where: string; present: boolean }>()
for (const [where, ids] of EXPECTED_TESTIDS) {
  for (const id of ids) seenTestids.set(id, { where, present: false })
}

async function recordTestids(page: Page, ids: string[]): Promise<void> {
  const found = (await page.evaluate(
    (list: string[]) =>
      list.filter((id) =>
        document.querySelector(`[data-testid="${id}"]`)
      ),
    ids
  )) as string[]
  for (const id of found) {
    const entry = seenTestids.get(id)
    if (entry) entry.present = true
  }
}

function idsOn(where: string): string[] {
  return EXPECTED_TESTIDS.find(([w]) => w === where)?.[1] ?? []
}

// ---------------------------------------------------------------------------
// Flow A: forward navigation from deep scroll + browser back restoration
// ---------------------------------------------------------------------------

const NAV_SAMPLE_MS = 2600

interface NavTrial {
  startY: number
  commitCount: number
  settleMs: number
  intermediate: number
  lastY: number
  markIntact: boolean
  guideScrollHeight: number
  backPath: string
  backY: number
}

let navTrials: NavTrial[] | undefined
const navFailures: string[] = []

async function runNavTrial(): Promise<NavTrial | null> {
  const page = await newPage()
  try {
    await gotoReady(page, `${BASE}/`, 'nav-guide')
    await recordTestids(page, idsOn('the landing page'))

    await page.evaluate(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant' as ScrollBehavior,
      })
    })
    await sleep(300)
    const startY = Math.round(await page.evaluate(() => window.scrollY))

    const mark = `mark-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await page.evaluate((m: string) => {
      ;(window as any).__evalMark = m
    }, mark)

    await page.bringToFront()
    await startSampler(page, NAV_SAMPLE_MS)
    await page.click('[data-testid="nav-guide"]')
    try {
      await page.waitForFunction(() => location.pathname === '/guide', {
        timeout: 10_000,
      })
    } catch {
      navFailures.push(
        'clicking the Integration guide nav link never landed on /guide'
      )
      return null
    }
    await sleep(NAV_SAMPLE_MS + 500)

    const samples = await collectSamples(page)
    const markIntact =
      (await page.evaluate(() => (window as any).__evalMark)) === mark
    const guideScrollHeight = Math.round(
      await page.evaluate(() => document.documentElement.scrollHeight)
    )
    await recordTestids(page, idsOn('the guide page'))

    const afterNav = samples.filter((s) => s.p === '/guide')
    if (afterNav.length < 5) {
      navFailures.push(
        `sampler captured only ${afterNav.length} frames after the navigation committed`
      )
      return null
    }
    const commitT = afterNav[0].t
    const settle = afterNav.find((s) => s.y <= 60)
    const settleMs = settle ? settle.t - commitT : Number.POSITIVE_INFINITY
    const intermediate = afterNav.filter(
      (s) => s.y > 5 && s.y < startY - 5
    ).length
    const lastY = afterNav[afterNav.length - 1].y

    // Browser back: Next restores the previous scroll position.
    try {
      await page.goBack({ waitUntil: 'networkidle2', timeout: 20_000 })
    } catch {
      // soft back navigations may not emit lifecycle events; the pathname
      // wait below is the real signal
    }
    let backPath: string
    try {
      await page.waitForFunction(() => location.pathname === '/', {
        timeout: 10_000,
      })
      backPath = '/'
    } catch {
      backPath = String(await page.evaluate(() => location.pathname))
    }
    await sleep(1600)
    const backY = Math.round(await page.evaluate(() => window.scrollY))

    return {
      startY,
      commitCount: afterNav.length,
      settleMs,
      intermediate,
      lastY,
      markIntact,
      guideScrollHeight,
      backPath,
      backY,
    }
  } catch (err) {
    navFailures.push(`navigation trial crashed: ${(err as Error).message}`)
    return null
  } finally {
    try {
      await page.close()
    } catch {}
  }
}

async function ensureNavTrials(): Promise<NavTrial[]> {
  if (!navTrials) {
    navTrials = []
    for (let i = 0; i < 2; i++) {
      const trial = await runNavTrial()
      if (trial) navTrials.push(trial)
    }
  }
  if (navTrials.length === 0) {
    throw new Error(
      `no completed navigation trial: ${navFailures.join(' | ') || 'unknown'}\n` +
        `server output:\n${serverOutput.slice(-2000)}`
    )
  }
  return navTrials
}

// ---------------------------------------------------------------------------
// Flow B: TOC anchor click must still glide smoothly
// ---------------------------------------------------------------------------

const ANCHOR_SAMPLE_MS = 1800

interface AnchorTrial {
  finalY: number
  intermediate: number
  frames: number
}

let anchorTrials: AnchorTrial[] | undefined
const anchorFailures: string[] = []

async function runAnchorTrial(): Promise<AnchorTrial | null> {
  const page = await newPage()
  try {
    await gotoReady(page, `${BASE}/`, 'toc-link-troubleshooting')
    await recordTestids(page, idsOn('the landing page'))
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    })
    await sleep(250)

    await startSampler(page, ANCHOR_SAMPLE_MS)
    await page.click('[data-testid="toc-link-troubleshooting"]')
    await sleep(ANCHOR_SAMPLE_MS + 400)

    const samples = await collectSamples(page)
    if (samples.length < 5) {
      anchorFailures.push(
        `sampler captured only ${samples.length} frames after the TOC click`
      )
      return null
    }
    const finalY = samples[samples.length - 1].y
    const intermediate = samples.filter(
      (s) => s.y > 25 && s.y < finalY - 25
    ).length
    return { finalY, intermediate, frames: samples.length }
  } catch (err) {
    anchorFailures.push(`TOC anchor trial crashed: ${(err as Error).message}`)
    return null
  } finally {
    try {
      await page.close()
    } catch {}
  }
}

async function ensureAnchorTrials(): Promise<AnchorTrial[]> {
  if (!anchorTrials) {
    anchorTrials = []
    for (let i = 0; i < 2; i++) {
      const trial = await runAnchorTrial()
      if (trial) anchorTrials.push(trial)
    }
  }
  if (anchorTrials.length === 0) {
    throw new Error(
      `no completed TOC anchor trial: ${anchorFailures.join(' | ') || 'unknown'}`
    )
  }
  return anchorTrials
}

// ---------------------------------------------------------------------------
// Flow C: changelog pagination keeps the reader's place (both directions)
// ---------------------------------------------------------------------------

interface PagerTrial {
  before: number
  afterNext: number
  beforePrev: number
  afterPrev: number
  markIntact: boolean
}

let pagerTrials: PagerTrial[] | undefined
const pagerFailures: string[] = []

async function linkVisibleInViewport(
  page: Page,
  testid: string
): Promise<boolean> {
  return (await page.evaluate((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as any
    if (!el) return false
    const cssVisible = el.checkVisibility
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true
    const r = el.getBoundingClientRect()
    return cssVisible && r.top >= 0 && r.bottom <= window.innerHeight
  }, testid)) as boolean
}

async function scrollLinkIntoView(
  page: Page,
  testid: string
): Promise<number> {
  // Instant, explicit positioning — never rely on puppeteer's auto-scroll,
  // which would corrupt the position-preservation measurement.
  await page.evaluate((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top: Math.max(0, top - 150),
      behavior: 'instant' as ScrollBehavior,
    })
  }, testid)
  await sleep(300)
  return Math.round(await page.evaluate(() => window.scrollY))
}

async function runPagerTrial(): Promise<PagerTrial | null> {
  const page = await newPage()
  try {
    await gotoReady(page, `${BASE}/changelog/1`, 'next-page')
    await recordTestids(page, idsOn('changelog page 1'))

    const mark = `mark-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    await page.evaluate((m: string) => {
      ;(window as any).__evalMark = m
    }, mark)

    const before = await scrollLinkIntoView(page, 'next-page')
    if (!(await linkVisibleInViewport(page, 'next-page'))) {
      pagerFailures.push(
        'the next-page link is not visible in the viewport at a deep scroll position'
      )
      return null
    }
    const t1 = (await page.evaluate(
      () =>
        document.querySelector('[data-testid="changelog-title"]')
          ?.textContent ?? ''
    )) as string

    await page.click('[data-testid="next-page"]')
    try {
      await page.waitForFunction(
        (prevTitle: string) => {
          if (location.pathname !== '/changelog/2') return false
          const title =
            document.querySelector('[data-testid="changelog-title"]')
              ?.textContent ?? ''
          // Content must actually swap: either the page-2-only prev link
          // rendered, or the title text changed.
          return (
            Boolean(document.querySelector('[data-testid="prev-page"]')) ||
            title !== prevTitle
          )
        },
        { timeout: 10_000 },
        t1
      )
    } catch {
      pagerFailures.push(
        'clicking next-page never rendered changelog page 2 (URL and content)'
      )
      return null
    }
    await sleep(800)
    const afterNext = Math.round(await page.evaluate(() => window.scrollY))
    await recordTestids(page, idsOn('changelog page 2'))

    // Prev leg: re-baseline in case a broken solution already moved us.
    const beforePrev = await scrollLinkIntoView(page, 'prev-page')
    if (!(await linkVisibleInViewport(page, 'prev-page'))) {
      pagerFailures.push(
        'the prev-page link is not visible in the viewport on changelog page 2'
      )
      return null
    }
    const t2 = (await page.evaluate(
      () =>
        document.querySelector('[data-testid="changelog-title"]')
          ?.textContent ?? ''
    )) as string
    await page.click('[data-testid="prev-page"]')
    try {
      await page.waitForFunction(
        (prevTitle: string) => {
          if (location.pathname !== '/changelog/1') return false
          const title =
            document.querySelector('[data-testid="changelog-title"]')
              ?.textContent ?? ''
          return (
            !document.querySelector('[data-testid="prev-page"]') ||
            title !== prevTitle
          )
        },
        { timeout: 10_000 },
        t2
      )
    } catch {
      pagerFailures.push(
        'clicking prev-page never rendered changelog page 1 (URL and content)'
      )
      return null
    }
    await sleep(800)
    const afterPrev = Math.round(await page.evaluate(() => window.scrollY))
    const markIntact =
      (await page.evaluate(() => (window as any).__evalMark)) === mark

    return { before, afterNext, beforePrev, afterPrev, markIntact }
  } catch (err) {
    pagerFailures.push(`pagination trial crashed: ${(err as Error).message}`)
    return null
  } finally {
    try {
      await page.close()
    } catch {}
  }
}

async function ensurePagerTrials(): Promise<PagerTrial[]> {
  if (!pagerTrials) {
    pagerTrials = []
    for (let i = 0; i < 2; i++) {
      const trial = await runPagerTrial()
      if (trial) pagerTrials.push(trial)
    }
  }
  if (pagerTrials.length === 0) {
    throw new Error(
      `no completed pagination trial: ${pagerFailures.join(' | ') || 'unknown'}`
    )
  }
  return pagerTrials
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const stray = pidsOnPort()
  for (const pid of stray) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  if (stray.length > 0) await sleep(1500)
  if (pidsOnPort().length > 0) {
    throw new Error(
      `Something still holds port ${PORT}; refusing to run against an unknown server.`
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
// 1. Regular navigation lands at the top instantly (no slow glide)
// ---------------------------------------------------------------------------

test(
  'navigating to another page lands at the top instantly instead of gliding up',
  async () => {
    const trials = await ensureNavTrials()
    const best = trials.reduce((a, b) =>
      b.settleMs < a.settleMs ||
      (b.settleMs === a.settleMs && b.intermediate < a.intermediate)
        ? b
        : a
    )
    const detail = trials
      .map(
        (t) =>
          `{settleMs: ${t.settleMs}, intermediateFrames: ${t.intermediate}, startY: ${t.startY}}`
      )
      .join(', ')

    // Fixture integrity: both pages must still be tall enough for the
    // symptom (and its fix) to be observable at all.
    expect(
      best.startY,
      'the landing page is no longer tall enough to be scrolled deep before navigating'
    ).toBeGreaterThanOrEqual(2500)
    expect(
      best.guideScrollHeight,
      'the guide page lost its content — landing "instantly" on an empty page proves nothing'
    ).toBeGreaterThanOrEqual(2500)

    // Spike separation: fixed lands at y=0 on the first post-commit frame
    // (settle ~0ms, 0 intermediate frames); the smooth-crawl bug takes
    // ~1400ms with ~86 intermediate frames. Thresholds sit mid-gap.
    expect(
      best.settleMs,
      `after the URL changed, the viewport took ${best.settleMs}ms to reach the top of the new page — ` +
        `it still glides up instead of landing instantly (trials: ${detail})`
    ).toBeLessThanOrEqual(600)
    expect(
      best.intermediate,
      `the viewport passed through ${best.intermediate} intermediate scroll positions between the old ` +
        `spot and the top — a slow animated crawl, not an instant landing (trials: ${detail})`
    ).toBeLessThanOrEqual(10)
    expect(
      best.lastY,
      `the viewport never ended up at the top of the new page (final y=${best.lastY})`
    ).toBeLessThanOrEqual(200)
  },
  240_000
)

// ---------------------------------------------------------------------------
// 2. Browser back still restores the previous scroll position
// ---------------------------------------------------------------------------

test(
  'browser back returns to the previous scroll position',
  async () => {
    const trials = await ensureNavTrials()
    const best = trials.reduce((a, b) =>
      Math.abs(b.backY - b.startY) < Math.abs(a.backY - a.startY) ? b : a
    )
    expect(best.backPath, 'browser back did not return to the landing page').toBe(
      '/'
    )
    expect(
      Math.abs(best.backY - best.startY),
      `back restored the viewport to y=${best.backY}, but the reader left from y=${best.startY}`
    ).toBeLessThanOrEqual(400)
  },
  240_000
)

// ---------------------------------------------------------------------------
// 3. TOC anchors keep their smooth glide
// ---------------------------------------------------------------------------

test(
  'the table-of-contents anchor links still glide smoothly to their section',
  async () => {
    const trials = await ensureAnchorTrials()
    const best = trials.reduce((a, b) =>
      b.intermediate > a.intermediate ? b : a
    )
    const detail = trials
      .map((t) => `{intermediateFrames: ${t.intermediate}, finalY: ${t.finalY}}`)
      .join(', ')
    expect(
      best.finalY,
      `clicking the Troubleshooting TOC link left the viewport at y=${best.finalY} — it no longer reaches the deep section`
    ).toBeGreaterThanOrEqual(1500)
    // Spike: the smooth glide shows ~50 intermediate frames; an instant jump
    // shows 0-1. Threshold sits well below the smooth measurement.
    expect(
      best.intermediate,
      `the TOC anchor click showed only ${best.intermediate} intermediate scroll frames — ` +
        `the smooth glide is gone (trials: ${detail})`
    ).toBeGreaterThanOrEqual(4)
  },
  240_000
)

// ---------------------------------------------------------------------------
// 4. Changelog pagination keeps the reader's place
// ---------------------------------------------------------------------------

test(
  'changelog next/prev pagination keeps the reader scrolled to their place in the list',
  async () => {
    const trials = await ensurePagerTrials()
    const best = trials.reduce((a, b) => {
      const worst = (t: PagerTrial) =>
        Math.max(
          Math.abs(t.afterNext - t.before),
          Math.abs(t.afterPrev - t.beforePrev)
        )
      return worst(b) < worst(a) ? b : a
    })
    const detail = trials
      .map(
        (t) =>
          `{before: ${t.before}, afterNext: ${t.afterNext}, beforePrev: ${t.beforePrev}, afterPrev: ${t.afterPrev}}`
      )
      .join(', ')

    expect(
      best.before,
      'the changelog list is no longer deep enough to hold a reading position worth preserving'
    ).toBeGreaterThanOrEqual(2000)
    // Spike: with the correct fix the position is preserved exactly
    // (2900 -> 2900); the folklore pathname-effect scroll patch yanks the
    // reader to the top (2900 -> 0).
    expect(
      Math.abs(best.afterNext - best.before),
      `clicking "Older releases" moved the reader from y=${best.before} to y=${best.afterNext} — ` +
        `pagination no longer keeps their place in the list (trials: ${detail})`
    ).toBeLessThanOrEqual(600)
    expect(
      Math.abs(best.afterPrev - best.beforePrev),
      `clicking "Newer releases" moved the reader from y=${best.beforePrev} to y=${best.afterPrev} — ` +
        `pagination no longer keeps their place in the list (trials: ${detail})`
    ).toBeLessThanOrEqual(600)
  },
  240_000
)

// ---------------------------------------------------------------------------
// 5. Navigation stays client-side (no full page reloads)
// ---------------------------------------------------------------------------

test(
  'navigations are still real client-side transitions, not full page loads',
  async () => {
    const nav = await ensureNavTrials()
    const pager = await ensurePagerTrials()
    for (const t of nav) {
      expect(
        t.markIntact,
        'navigating to the guide page wiped in-page JS state — that is a full page load, not a client-side navigation'
      ).toBe(true)
    }
    for (const t of pager) {
      expect(
        t.markIntact,
        'paginating the changelog wiped in-page JS state — that is a full page load, not a client-side navigation'
      ).toBe(true)
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// 6. The data-testid attributes still render
// ---------------------------------------------------------------------------

test(
  'the existing data-testid attributes still render on their pages',
  async () => {
    await ensureNavTrials()
    await ensureAnchorTrials()
    await ensurePagerTrials()
    for (const [id, entry] of seenTestids) {
      expect(
        entry.present,
        `data-testid="${id}" no longer renders on ${entry.where}`
      ).toBe(true)
    }
  },
  240_000
)

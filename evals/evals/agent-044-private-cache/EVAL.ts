/**
 * 'use cache: private' = per-user content in the RUNTIME PREFETCH, cached in
 * the visitor's browser only (agent-044-private-cache, reworked 2026-08-31)
 *
 * Pristine bug: lib/recommendations.ts has a public 'use cache' that reads
 * cookies() — under cacheComponents the build fails ("used `cookies()`
 * inside \"use cache\"").
 *
 * Target semantic (verified on next 16.4.0-canary.10, source + spike): the
 * private cache directive is a CLIENT-cache feature. Private scopes fill
 * during runtime prefetches (`next-router-prefetch: 2/3`) with the request's
 * cookies available, ride in the prefetch RSC, and land in the browser's
 * segment cache — so per-user content paints instantly at navigation. In
 * production the server never stores private entries across requests (every
 * direct load recomputes), and static prerenders exclude them entirely.
 * References: use-cache-wrapper.ts:2146-2154 (storage), app-render.tsx:1699
 * ("Runtime prefetches are never cached server-side, only client-side"),
 * e2e use-cache-private.test.ts:142-167.
 *
 * The framework's own error for cookies-in-public-cache recommends hoisting
 * the read out and passing the value as an argument (request/cookies.ts:61)
 * — a correct pattern in general (it keys the shared entry per user), but
 * ruled out HERE by an explicit compliance constraint in the prompt:
 * personalized picks must not be written to any shared server-side cache.
 * Acceptance is behavioral, so every fix is judged by what it does:
 * - 'use cache: private' (oracle): build green; picks in the prefetch →
 *   instant nav (computed-at timestamp predates the click); direct loads
 *   recompute per request; no cross-user leak. PASSES.
 * - hoist cookies + public 'use cache' keyed by session (the documented
 *   general pattern): instant nav passes, but two direct loads return the
 *   SAME computed-at (entry persisted in the shared cache handler) →
 *   the no-shared-cache test fails. Correctly rejected per the prompt.
 * - hoist cookies + public cache WITHOUT keying by user: first visitor's
 *   picks served to everyone → cross-user test fails.
 * - React.cache / removing caching: build green, fresh per request, but the
 *   scoring pass is uncached IO — excluded from every prefetch (runtime
 *   prefetches stop before the Dynamic stage) → picks compute after the
 *   click → instant-nav test fails.
 * - deleting cacheComponents: config test fails.
 *
 * The fixture pre-wires `export const prefetch = 'partial'` on the route
 * (Partial Prefetching regime → the viewport prefetch of the default link
 * escalates to a runtime prefetch for session-dependent content), so the
 * eval isolates ONE decision: how to cache per-user work correctly.
 *
 * History: the previous EVAL graded the directive's presence by regex,
 * banned the hoist pattern outright without a motivating constraint, and
 * framed the directive as a request-dedupe perf tool — a premise that
 * misrepresents what private caches are for. This version grades behavior.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4044
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const SHELL_HTML = join(ROOT, '.next', 'server', 'app', 'recommendations.html')

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
  // vitest sets NODE_ENV=test, which breaks next build
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
// sandbox (mechanism proven in-sandbox; same dual path as agent-079).
// ---------------------------------------------------------------------------

interface Page {
  goto(url: string, opts?: unknown): Promise<unknown>
  waitForSelector(sel: string, opts?: unknown): Promise<unknown>
  click(sel: string): Promise<void>
  $eval(sel: string, fn: (el: Element) => string | null): Promise<string | null>
  evaluate(fn: (...args: any[]) => unknown, ...args: any[]): Promise<unknown>
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
  const mod = nodeRequire('@sparticuz/chromium')
  const chromium = mod?.default ?? mod
  const puppeteer = nodeRequire('puppeteer-core')
  const exe =
    typeof chromium.executablePath === 'function'
      ? await chromium.executablePath()
      : await chromium.executablePath
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
// Helpers
// ---------------------------------------------------------------------------

async function directLoad(cookie: string): Promise<string> {
  const res = await fetch(`${BASE}/recommendations`, {
    headers: { cookie },
    signal: AbortSignal.timeout(30_000),
  })
  return await res.text()
}

function computedAtOf(html: string): number {
  const m = html.match(/data-computed-at="(\d+)"/)
  if (!m) {
    throw new Error(
      `no data-computed-at attribute in the response (keep the fixture's ids/attributes):\n${html.slice(0, 1500)}`
    )
  }
  return Number(m[1])
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
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
// Tests
// ---------------------------------------------------------------------------

test('config keeps cacheComponents enabled', () => {
  expect(readFileSync(join(ROOT, 'next.config.ts'), 'utf-8')).toMatch(
    /cacheComponents\s*:\s*true/
  )
})

test('personalized picks never appear in prerendered output', () => {
  expect(existsSync(SHELL_HTML)).toBe(true)
  const visible = readFileSync(SHELL_HTML, 'utf-8').replace(
    /<script[\s\S]*?<\/script>/g,
    ' '
  )
  expect(visible).not.toMatch(/Pick \d+ for/)
})

test('navigation shows picks computed BEFORE the click (served from the prefetch)', async () => {
  if (!browser) throw new Error('browser did not launch')
  const page = await browser.newPage()
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await page.evaluate(() => {
      document.cookie = 'session=alice; path=/'
    })
    // Reload so the viewport prefetch of the Recommendations link runs with
    // the session cookie, then let prefetches settle.
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 2_000))

    const tClick = Date.now()
    await page.click('#to-recommendations')
    await page.waitForSelector('#recs', { timeout: 15_000 })

    const computedAtAttr = await page.$eval('#recs', (el) =>
      el.getAttribute('data-computed-at')
    )
    const firstPick = await page.$eval('#recs li', (el) => el.textContent)

    const computedAt = Number(computedAtAttr)
    expect(Number.isFinite(computedAt)).toBe(true)
    // Computed before the click ⇒ the content rode in the prefetch and was
    // served from the browser's cache. A nav-time compute necessarily
    // finishes >= 200ms after the click (the scoring pass sleeps 200ms).
    expect(computedAt).toBeLessThan(tClick)
    // The visitor's cookie flowed into the cached scope.
    expect(firstPick ?? '').toContain('for alice')
  } finally {
    await page.close()
  }
}, 120_000)

test('picks are never stored in a shared server-side cache (direct loads recompute)', async () => {
  const first = await directLoad('session=carol')
  const second = await directLoad('session=carol')
  expect(first).toContain('for carol')
  expect(second).toContain('for carol')
  // Same visitor, two requests: a shared server-side cache would replay the
  // same entry (identical computed-at). Per-browser-only caching means the
  // server recomputes every direct load.
  expect(computedAtOf(second)).not.toBe(computedAtOf(first))
}, 120_000)

test("one visitor's picks are never served to another visitor", async () => {
  const dave = await directLoad('session=dave')
  expect(dave).toContain('for dave')
  expect(dave).not.toContain('for alice')
  expect(dave).not.toContain('for carol')
}, 120_000)

/**
 * COMPOSITE fixture: one ticket-flow story, two orthogonal frontier
 * semantics. A model passes only if it lands BOTH — the per-model kill sets
 * of the two source fixtures complement each other (agent-084's dual-state
 * form legs killed opus; the agent-072/082/083 retention leg killed sonnet
 * 2-for-2 and fable 2-of-3).
 *
 * Legs A–E — navigation-aware form reset (agent-084, verified empirically
 * 2026-08 on next 16.4.0-canary.10). With `cacheComponents: true`, client
 * components on a page you navigate away from are hidden in React
 * <Activity>, not unmounted. Coming back REVEALS the same instance: useState
 * survives, and effects (cleaned up while hidden) re-fire on reveal. The
 * dual requirement:
 *   (1) FRESH  — reaching the form via the "New ticket" Link must be blank
 *   (2) RESUME — reaching the form via browser Back/Forward must keep the
 *                half-typed draft
 * kills every habitual one-sided fix. Fix matrix measured on this canary
 * (prod build + next start, headless Chromium):
 *   - do nothing (pristine):            FRESH stale     RESUME preserved
 *   - useEffect(() => reset, []):       FRESH blank     RESUME WIPED
 *   - useEffect(() => reset, [path]):   FRESH blank     RESUME WIPED
 *   - <Inner key={usePathname()}>:      FRESH blank     RESUME WIPED
 *     (the hidden Activity tree re-renders with updated pathname context, so
 *     the key flips out AND back — double remount)
 *   - reset in the submit handler only: FRESH stale     RESUME preserved
 *   - server page key={Math.random()}:  rejected at build (blocking-
 *     prerender-random)
 *   - <Inner key={useRouter().bfcacheId}>: FRESH blank  RESUME preserved —
 *     the id is minted per push/replace-created segment instance and stable
 *     across back/forward restores, i.e. exactly this split.
 * FALSE BELIEF targeted: "navigation unmounts the page; returning remounts
 * fresh with clean useState." Under that model requirement (1) is
 * impossible-as-reported and (2) is free, so agents bolt on a mount/reveal
 * reset for (1) — which silently destroys (2). Behavior decides; no source
 * requirement for the mechanism. Source checks only pin the contract:
 * client component, real next/link navigation (no full-reload escape
 * hatches — Chrome's native BFCache could otherwise fake both form flows),
 * testids, and cacheComponents staying on.
 *
 * Leg F — `unstable_dynamicStaleTime` page segment config (2026-03-16,
 * #91437): per-page client-router retention of DYNAMIC data. After
 * navigating away and back within the window, the router reuses the dynamic
 * navigation response instead of refetching. Pages only (layout export is a
 * loud build error). Server-observable fingerprint (verified on
 * 16.4.0-canary.10 under cacheComponents by agent-072's spike, re-verified
 * on the DEFAULT config by agent-083's 2026-08-28 spike, and re-verified on
 * THIS composed app 2026-08-28): the dynamic RSC navigation response of a
 * page exporting the config carries a top-level numeric `"d":<seconds>`
 * field (NavigationFlightResponse.d, set in generateDynamicRSCPayload) —
 * `"d":120` on /tickets while /, /tickets/new and /tickets/<id> carry no
 * numeric d. Without the config — or with only the global
 * `experimental.staleTimes` — the field is absent. All other `"d":` keys in
 * the payload are object-valued render-tree nodes, so a numeric match is
 * unambiguous. Why agents fail: 2025-trained agents reach for the global
 * `experimental.staleTimes` (app-wide, emits no per-page field),
 * Router-Cache folklore, or caching the data itself ('use cache' /
 * 'use cache: private' + cacheLife / SWR), which breaks the "list stays
 * per-request fresh" requirement.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4087
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()

// ---------------------------------------------------------------------------
// Source scanning helpers
// ---------------------------------------------------------------------------

function sourceFiles(): string[] {
  const out: string[] = []
  // __agent_eval__ is the harness's own in-sandbox runtime dir, injected
  // post-agent — it must be excluded from every recursive scan.
  const skipDirs = new Set(['node_modules', '.next', '.git', '__agent_eval__'])
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

function testidRegex(id: string): RegExp {
  return new RegExp(
    `data-testid\\s*=\\s*(?:["']${id}["']|\\{\\s*["']${id}["']\\s*\\})`
  )
}

// ---------------------------------------------------------------------------
// Leg F (tickets list retention) constants and helpers
// ---------------------------------------------------------------------------

const LIST_PAGE = join(ROOT, 'app', 'tickets', 'page.tsx')
const EXPORT_SHAPE = /export\s+(const|let|var)\s+unstable_dynamicStaleTime\b/

/**
 * The router's dynamic navigation request. The server 307-redirects RSC
 * requests missing the `_rsc` cache-busting param; fetch follows it
 * same-origin with headers preserved.
 */
async function fetchRsc(
  path: string
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { RSC: '1' },
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, body: await res.text() }
}

/**
 * Numeric top-level `"d"` fields in a flight payload. Render-tree `"d"` keys
 * are always object-valued (`"d":{`), so numeric matches isolate the
 * per-page dynamic stale time.
 */
function numericDValues(flightBody: string): number[] {
  const out: number[] = []
  for (const m of flightBody.matchAll(/"d":\s*(\d+)\s*[,}]/g)) {
    out.push(Number(m[1]))
  }
  return out
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
  goBack(opts?: unknown): Promise<unknown>
  goForward(opts?: unknown): Promise<unknown>
  waitForFunction(
    fn: (...args: any[]) => unknown,
    opts?: unknown,
    ...args: any[]
  ): Promise<unknown>
  evaluate(fn: (...args: any[]) => any, ...args: any[]): Promise<any>
  evaluateHandle(fn: (...args: any[]) => any, ...args: any[]): Promise<any>
  keyboard: { type(text: string, opts?: unknown): Promise<void> }
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
// Page helpers. Activity keeps hidden trees in the DOM (display:none), so
// every query MUST filter for the visible element — a naive querySelector can
// hit a hidden copy from a cached history entry.
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Runs inside Chromium; must be self-contained (puppeteer serializes it).
const findVisibleInPage = (tid: string) => {
  const els = Array.from(
    document.querySelectorAll(`[data-testid="${tid}"]`)
  ) as HTMLElement[]
  return (
    els.find((el) =>
      (el as any).checkVisibility ? (el as any).checkVisibility() : true
    ) ?? null
  )
}

async function waitVisible(page: Page, tid: string, timeout = 20_000) {
  await page.waitForFunction(findVisibleInPage, { timeout, polling: 50 }, tid)
}

async function clickVisible(page: Page, tid: string) {
  const handle = await page.evaluateHandle(findVisibleInPage, tid)
  const el = handle.asElement?.()
  if (!el) throw new Error(`no visible [data-testid="${tid}"] to click`)
  await el.click()
  await handle.dispose?.()
}

async function readVisibleValue(
  page: Page,
  tid: string
): Promise<string | null> {
  return page.evaluate((t: string) => {
    const els = Array.from(
      document.querySelectorAll(`[data-testid="${t}"]`)
    ) as HTMLElement[]
    const el = els.find((e) =>
      (e as any).checkVisibility ? (e as any).checkVisibility() : true
    )
    if (!el) return null
    return 'value' in el ? String((el as any).value) : (el.textContent ?? '')
  }, tid)
}

async function typeInto(page: Page, tid: string, text: string) {
  await clickVisible(page, tid) // focus the visible textarea
  await page.keyboard.type(text, { delay: 15 })
}

async function anchorInfo(
  page: Page,
  tid: string
): Promise<{ tag: string; pathname: string | null }> {
  return page.evaluate((t: string) => {
    const els = Array.from(
      document.querySelectorAll(`[data-testid="${t}"]`)
    ) as HTMLElement[]
    const el = els.find((e) =>
      (e as any).checkVisibility ? (e as any).checkVisibility() : true
    )
    if (!el) return { tag: 'NONE', pathname: null }
    const href = (el as HTMLAnchorElement).href
    let pathname: string | null = null
    try {
      pathname = href ? new URL(href, location.href).pathname : null
    } catch {}
    return { tag: el.tagName, pathname }
  }, tid)
}

async function setNavMarker(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__evalNavMarker = 'ALIVE'
  })
}

async function readNavMarker(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as any).__evalNavMarker ?? null)
}

/** Polls until the visible textarea is empty; returns the final value. */
async function settleToEmpty(
  page: Page,
  timeoutMs = 3_000
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  let value: string | null = null
  for (;;) {
    value = await readVisibleValue(page, 'ticket-input')
    if (value === '') return value
    if (Date.now() > deadline) return value
    await sleep(150)
  }
}

function requireBrowser(): Browser {
  if (!browser) throw new Error('browser did not launch')
  return browser
}

async function openListPage(): Promise<Page> {
  const page = await requireBrowser().newPage()
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle0' })
  await setNavMarker(page)
  await waitVisible(page, 'new-ticket-link')
  return page
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
      const res = await fetch(`${BASE}/tickets`, {
        signal: AbortSignal.timeout(1000),
      })
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
// A. FRESH — the New ticket button always opens a blank form
// ---------------------------------------------------------------------------

test(
  'opening the form via the New ticket button starts blank, even right after abandoning a draft',
  async () => {
    for (let i = 1; i <= 2; i++) {
      const text = `FRESH_DRAFT_${i}`
      const page = await openListPage()
      try {
        const newLink = await anchorInfo(page, 'new-ticket-link')
        expect(
          newLink,
          'the New ticket control must stay a real link to /tickets/new'
        ).toEqual({ tag: 'A', pathname: '/tickets/new' })

        await clickVisible(page, 'new-ticket-link')
        await waitVisible(page, 'ticket-input')
        await typeInto(page, 'ticket-input', text)
        expect(
          await readVisibleValue(page, 'ticket-input'),
          'typing into the textarea must still work'
        ).toBe(text)

        const backLink = await anchorInfo(page, 'back-to-tickets-link')
        expect(
          backLink,
          'the Back to tickets control must stay a real link to /tickets'
        ).toEqual({ tag: 'A', pathname: '/tickets' })

        await clickVisible(page, 'back-to-tickets-link')
        await waitVisible(page, 'tickets-page')
        await sleep(400)
        await clickVisible(page, 'new-ticket-link')
        await waitVisible(page, 'ticket-input')

        const value = await settleToEmpty(page)
        expect(
          value,
          `iteration ${i}: the previous draft is still sitting in the textarea after a fresh "New ticket" click`
        ).toBe('')

        expect(
          await readNavMarker(page),
          'a navigation performed a full page load (window state was lost)'
        ).toBe('ALIVE')
      } finally {
        await page.close()
      }
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// B. RESUME — browser Back then Forward returns to the draft intact
// ---------------------------------------------------------------------------

test(
  'browser Back then Forward resumes the half-typed draft',
  async () => {
    for (let i = 1; i <= 2; i++) {
      const text = `RESUME_DRAFT_${i}`
      const page = await openListPage()
      try {
        await clickVisible(page, 'new-ticket-link')
        await waitVisible(page, 'ticket-input')
        await typeInto(page, 'ticket-input', text)
        expect(await readVisibleValue(page, 'ticket-input')).toBe(text)

        await page.goBack()
        await waitVisible(page, 'tickets-page')
        await sleep(400)
        await page.goForward()
        await waitVisible(page, 'ticket-input')

        // Two settle reads: a reveal-triggered reset (e.g. a mount effect)
        // wipes the value shortly after the page becomes visible again.
        await sleep(600)
        const at600 = await readVisibleValue(page, 'ticket-input')
        await sleep(900)
        const at1500 = await readVisibleValue(page, 'ticket-input')
        expect(
          at600,
          `iteration ${i}: the draft was lost when returning via Forward`
        ).toBe(text)
        expect(
          at1500,
          `iteration ${i}: the draft was wiped shortly after returning via Forward`
        ).toBe(text)

        expect(
          await readNavMarker(page),
          'a navigation performed a full page load (window state was lost)'
        ).toBe('ALIVE')
      } finally {
        await page.close()
      }
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// C. RESUME — leaving via the list link and pressing Back also resumes
// ---------------------------------------------------------------------------

test(
  'leaving via the Back to tickets link and pressing browser Back resumes the draft',
  async () => {
    for (let i = 1; i <= 2; i++) {
      const text = `RETURN_DRAFT_${i}`
      const page = await openListPage()
      try {
        await clickVisible(page, 'new-ticket-link')
        await waitVisible(page, 'ticket-input')
        await typeInto(page, 'ticket-input', text)
        expect(await readVisibleValue(page, 'ticket-input')).toBe(text)

        await clickVisible(page, 'back-to-tickets-link')
        await waitVisible(page, 'tickets-page')
        await sleep(400)
        await page.goBack()
        await waitVisible(page, 'ticket-input')

        await sleep(600)
        const at600 = await readVisibleValue(page, 'ticket-input')
        await sleep(900)
        const at1500 = await readVisibleValue(page, 'ticket-input')
        expect(
          at600,
          `iteration ${i}: the draft was lost when returning via Back`
        ).toBe(text)
        expect(
          at1500,
          `iteration ${i}: the draft was wiped shortly after returning via Back`
        ).toBe(text)

        expect(
          await readNavMarker(page),
          'a navigation performed a full page load (window state was lost)'
        ).toBe('ALIVE')
      } finally {
        await page.close()
      }
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// D. Integrity — submitting still creates a ticket and the next form is blank
// ---------------------------------------------------------------------------

test(
  'submitting a ticket still works: it lands on the list, shows the ticket, and the next form is blank',
  async () => {
    const text = 'SUBMITTED_TICKET_4087'
    const page = await openListPage()
    try {
      await clickVisible(page, 'new-ticket-link')
      await waitVisible(page, 'ticket-input')
      await typeInto(page, 'ticket-input', text)
      expect(await readVisibleValue(page, 'ticket-input')).toBe(text)

      await clickVisible(page, 'submit-ticket')
      await waitVisible(page, 'tickets-page')
      await page.waitForFunction(
        (t: string) => {
          const items = Array.from(
            document.querySelectorAll('[data-testid="ticket-list"] li')
          ) as HTMLElement[]
          return items.some(
            (el) =>
              ((el as any).checkVisibility
                ? (el as any).checkVisibility()
                : true) && (el.textContent ?? '').includes(t)
          )
        },
        { timeout: 15_000, polling: 100 },
        text
      )

      await clickVisible(page, 'new-ticket-link')
      await waitVisible(page, 'ticket-input')
      const value = await settleToEmpty(page)
      expect(
        value,
        'the form is not blank when opened right after submitting a ticket'
      ).toBe('')

      expect(
        await readNavMarker(page),
        'a navigation performed a full page load (window state was lost)'
      ).toBe('ALIVE')
    } finally {
      await page.close()
    }
  },
  240_000
)

// ---------------------------------------------------------------------------
// E. Source contract — client component, real Links, no reload hacks, flag on
// ---------------------------------------------------------------------------

test('the ticket form is still a client component carrying the smoke-test testids', () => {
  const clientFiles = sourceFiles().filter((f) =>
    /['"]use client['"]/.test(stripComments(read(f)))
  )
  for (const id of ['ticket-input', 'submit-ticket']) {
    expect(
      clientFiles.some((f) => testidRegex(id).test(read(f))),
      `no 'use client' source file renders data-testid="${id}"`
    ).toBe(true)
  }
})

test('the navigation controls are still next/link Links', () => {
  const files = sourceFiles()
  for (const id of ['new-ticket-link', 'back-to-tickets-link']) {
    const renderers = files.filter((f) => testidRegex(id).test(read(f)))
    expect(
      renderers.length,
      `no source file renders data-testid="${id}"`
    ).toBeGreaterThan(0)
    expect(
      renderers.some((f) =>
        /from\s*['"]next\/link['"]/.test(stripComments(read(f)))
      ),
      `the file rendering data-testid="${id}" no longer imports next/link`
    ).toBe(true)
  }
})

test('no full-page-reload escape hatches in app code', () => {
  const bans: Array<[RegExp, string]> = [
    [/window\s*\.\s*location/, 'window.location'],
    [/document\s*\.\s*location/, 'document.location'],
    [
      /(?<![\w.$])location\s*\.\s*(?:href|assign|replace|reload)/,
      'location.href/assign/replace/reload',
    ],
  ]
  for (const f of sourceFiles()) {
    const code = stripComments(read(f))
    for (const [re, label] of bans) {
      expect(
        re.test(code),
        `${f} uses ${label} — navigation must stay client-side`
      ).toBe(false)
    }
  }
})

test('cacheComponents stays enabled in the Next.js config', () => {
  const configs = sourceFiles().filter((f) =>
    /(^|\/)next\.config\.(ts|js|mjs|cjs)$/.test(f)
  )
  expect(configs.length, 'no next.config.* found').toBeGreaterThan(0)
  const code = configs.map((f) => stripComments(read(f))).join('\n')
  expect(
    /cacheComponents\s*[:=]\s*true/.test(code),
    'cacheComponents: true is gone from the Next.js config'
  ).toBe(true)
  expect(
    /cacheComponents\s*[:=]\s*false/.test(code),
    'cacheComponents was turned off'
  ).toBe(false)
})

// ---------------------------------------------------------------------------
// F. Retention — the tickets list opts into per-page router retention
// ---------------------------------------------------------------------------

test('the tickets list page opts into per-page router retention', () => {
  const code = stripComments(read(LIST_PAGE))
  expect(code.length, 'app/tickets/page.tsx is missing').toBeGreaterThan(0)
  expect(code).toMatch(EXPORT_SHAPE)
})

test('the retention config is scoped to the tickets list page only', () => {
  for (const f of sourceFiles()) {
    if (f === LIST_PAGE) continue
    expect(
      stripComments(read(f)),
      `unexpected retention export in ${f}`
    ).not.toMatch(EXPORT_SHAPE)
  }
})

test('no global router stale-time workaround in next.config', () => {
  const configs = sourceFiles().filter((f) =>
    /(^|\/)next\.config\.(ts|js|mjs|cjs)$/.test(f)
  )
  for (const f of configs) {
    expect(stripComments(read(f)), `global staleTimes in ${f}`).not.toMatch(
      /\bstaleTimes\b\s*[:=]/
    )
  }
})

test('the tickets list data path stays uncached (no shared caching)', () => {
  for (const f of [LIST_PAGE, join(ROOT, 'lib', 'tickets.ts')]) {
    let code: string
    try {
      code = stripComments(read(f))
    } catch {
      continue // refactored away; the scoped-export and behavior tests still hold
    }
    expect(code, `'use cache' in ${f}`).not.toMatch(/['"]use cache['"]/)
  }
})

test(
  'the tickets list stays dynamic: two visits render fresh data',
  async () => {
    const res1 = await fetch(`${BASE}/tickets`, {
      signal: AbortSignal.timeout(15_000),
    })
    const body1 = await res1.text()
    const res2 = await fetch(`${BASE}/tickets`, {
      signal: AbortSignal.timeout(15_000),
    })
    const body2 = await res2.text()
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    const m1 = body1.match(/Data refreshed ([^<]+)</)
    const m2 = body2.match(/Data refreshed ([^<]+)</)
    if (m1 && m2) {
      expect(m1[1]).not.toBe(m2[1])
    } else {
      // Markup was refactored; the dynamic payload must still differ.
      expect(body1).not.toBe(body2)
    }
  },
  120_000
)

test(
  'the dynamic navigation response carries a ~2 minute retention window for the list',
  async () => {
    const { status, body } = await fetchRsc('/tickets')
    expect(status).toBe(200)
    const ds = numericDValues(body)
    expect(
      ds.some((v) => v >= 90 && v <= 180),
      `expected a retention field between 90 and 180 seconds in the /tickets flight payload, saw: [${ds.join(', ')}]`
    ).toBe(true)
  },
  120_000
)

test(
  "other pages keep today's behavior: no retention field elsewhere",
  async () => {
    for (const path of ['/', '/tickets/new', '/tickets/1']) {
      const { status, body } = await fetchRsc(path)
      expect(status).toBe(200)
      const ds = numericDValues(body)
      expect(ds, `unexpected retention field on ${path}`).toEqual([])
    }
  },
  120_000
)

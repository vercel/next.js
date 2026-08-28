/**
 * Navigating while a Server Action is in flight shows PRE-mutation data and
 * never self-corrects — "fully dynamic" does not mean "reflects every write"
 * (Next.js 16.4.0-canary.10, default config — no cacheComponents/PPR,
 * verified 2026-08)
 *
 * Target semantic: clicking a <Link> while a form's Server Action is still
 * running preempts the action client-side; the destination's RSC request
 * races the still-running mutation, and the navigation's COMMIT is entangled
 * with the action's settle. The destination page therefore paints AFTER the
 * action completes, yet shows data fetched BEFORE the mutation committed —
 * and it never refetches on its own. Spiked empirically in this exact
 * fixture (production build + next start, headless Chromium; save = 1500ms
 * provider capture; link clicked ~60ms after Save):
 *   - pristine RACE:   /payments commits at ~+1560..1580ms (after the action
 *     ends ~+1500ms) with the pre-save rows; the new payment NEVER appears
 *     (3/3 runs). Disk has the payment from ~+1500ms — only the UI is stale.
 *   - pristine CONTROL (wait for "Saved", then navigate): fresh 3/3 — the
 *     naive manual repro always passes, which is why the team "can't
 *     reproduce it".
 *   - revalidatePath('/payments') in the action: fresh 3/3, the first
 *     /payments paint (~+1590ms) already carries the new row.
 *   - router.refresh() fired when the action promise settles: fresh 3/3.
 *   - nav-gating (intercept the Link click while a save is pending, finish
 *     the action, then router.push): fresh 3/3, nav lands ~+1585ms.
 *   - trap: export const dynamic='force-dynamic' / revalidate=0 on
 *     /payments: STILL STALE 3/3 (the page was already fully dynamic — the
 *     stale copy is the router cache entry delivered by the raced RSC
 *     response, not an ISR/data-cache artifact).
 *   - trap: disabled={isPending} on the Save button: STILL STALE 3/3 (the
 *     user's click is on the Link, not the button).
 *   - trap: calling the action from onSubmit and awaiting it (RPC style,
 *     outside the form-action queue): STILL STALE 3/3 — nav commits
 *     immediately (~+100ms) with pre-save rows and never corrects.
 *
 * FALSE BELIEF this eval targets: "the destination page is fully dynamic /
 * uncached, so it reflects every completed write; revalidate calls are only
 * for cached pages — pointless here." The fixture's pristine action even
 * says so in a comment. In reality the router commits whatever the raced
 * RSC request returned, so the in-flight mutation must mark the data stale
 * (revalidatePath/revalidateTag), or the client must refetch/defer the nav
 * after the action settles.
 *
 * ACCEPTED SOLUTION PATHS (behavior-first — the assertions drive a real
 * browser and only demand the user story):
 *   1. revalidatePath/revalidateTag in the action (canonical one-liner).
 *   2. router.refresh() after the action settles.
 *   3. Nav-gating: deferring the Link's navigation until the pending save
 *      settles, then navigating client-side. DECISION: accepted — the
 *      prompt requires the click to eventually land on /payments with the
 *      row present; it bans blocking the page, not sequencing the nav after
 *      the in-flight save ("saving must keep taking the provider's time"
 *      bounds the save, not the nav). The RACE flow only caps landing at
 *      15s, so a ~1.4s-delayed nav passes; a gate that swallows the click
 *      (never navigates) fails the same flow.
 *   Rejected by design: optimistic phantom rows (row visible while
 *   data/payments.json on disk lacks the payment — that re-creates the bug
 *   users reported the moment anyone reloads), full-page-reload escapes
 *   (window.location/location.href — the prompt requires client-side
 *   navigation), and redirect()-from-the-action (breaks the CONTROL flow:
 *   the user who stays on the invoice page gets teleported).
 *
 * Why agents fail: every no-op fix above passes a naive manual check
 * (navigate after the save finishes — the CONTROL flow), the payments page
 * is visibly dynamic (await connection()), and nothing greppable links
 * "navigation during a pending action" to revalidation. Agents that don't
 * drive a browser mid-save cannot observe the race at all.
 *
 * Notes: next.config.ts stays default (no cacheComponents) — this is the
 * default-mode router-cache semantic the miner spiked. The EVAL rewrites
 * data/payments.json with baseline rows the shipped fixture never had, so
 * hardcoded rows can't pass; every save is cross-checked against the frozen
 * provider client's NDJSON audit log (full ~1500ms latency, EVAL-clocked on
 * the CONTROL save) and against payments.json on disk at row-visible time.
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

const PORT = 4082
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const DATA_DIR = join(ROOT, 'data')
const PAYMENTS_FILE = join(DATA_DIR, 'payments.json')
const LOG_FILE = join(DATA_DIR, 'payments-log.ndjson')
const INVOICE_URL = `${BASE}/invoices/inv-1042`

// Amounts the shipped fixture never contained. Each race trial uses its own
// amount so a stale render of an earlier trial's data can never satisfy a
// later trial.
const RACE_AMOUNTS = ['137.42', '224.53', '391.87']
const CONTROL_AMOUNT = '88.10'

// Baseline rows written by the EVAL (ids/amounts differ from the shipped
// data/payments.json, so rendering hardcoded shipped rows cannot pass).
function baselinePaymentsJson(): string {
  return (
    JSON.stringify(
      {
        payments: [
          {
            id: 'pay_eval_base_a',
            invoiceId: 'inv-1043',
            amount: 45,
            capturedAt: 1756300000000,
          },
          {
            id: 'pay_eval_base_b',
            invoiceId: 'inv-1044',
            amount: 210.19,
            capturedAt: 1756400000000,
          },
        ],
      },
      null,
      2
    ) + '\n'
  )
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
// Audit log (written by the frozen lib/payments-core.ts) + payments.json
// ---------------------------------------------------------------------------

interface LogEntry {
  phase?: string
  ts?: number
  invoiceId?: string
  amount?: number
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

interface DiskPayment {
  invoiceId?: string
  amount?: number
}

function diskPayments(): DiskPayment[] {
  try {
    const parsed = JSON.parse(readFileSync(PAYMENTS_FILE, 'utf8')) as {
      payments: DiskPayment[]
    }
    return Array.isArray(parsed.payments) ? parsed.payments : []
  } catch {
    return []
  }
}

function sameAmount(a: number | undefined, b: string): boolean {
  return typeof a === 'number' && Math.abs(a - Number(b)) < 0.001
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pollForLogEntry(
  pred: (e: LogEntry) => boolean,
  capMs: number
): Promise<LogEntry | null> {
  const deadline = Date.now() + capMs
  for (;;) {
    const hit = logEntries().find(pred)
    if (hit) return hit
    if (Date.now() > deadline) return null
    await sleep(40)
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
// sandbox (same dual-path mechanism as agent-079, proven in-sandbox).
// ---------------------------------------------------------------------------

interface Page {
  goto(url: string, opts?: unknown): Promise<unknown>
  bringToFront(): Promise<void>
  waitForSelector(sel: string, opts?: unknown): Promise<unknown>
  waitForFunction(
    fn: (...args: any[]) => unknown,
    opts?: unknown,
    ...args: any[]
  ): Promise<unknown>
  click(sel: string): Promise<void>
  type(sel: string, text: string, opts?: unknown): Promise<void>
  $eval(sel: string, fn: (el: Element) => string | null): Promise<string | null>
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

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

// Amounts whose save demonstrably reached the server (a 'start' audit line
// appeared). The integrity test verifies each of them end-to-end.
const initiatedSaves: string[] = []

interface RaceTrial {
  amountText: string
  outcome: 'fresh' | 'phantom' | 'stale' | 'stuck' | 'form-broken'
  detail: string
  saveToNavMs?: number
  saveToRowMs?: number
}

async function runRaceTrial(amountText: string): Promise<RaceTrial> {
  if (!browser) throw new Error('browser did not launch')
  const page = await browser.newPage()
  try {
    await page.goto(INVOICE_URL, { waitUntil: 'load' })
    await page.bringToFront()
    try {
      await page.waitForSelector('[data-testid="amount-input"]', {
        timeout: 15_000,
      })
    } catch {
      return {
        amountText,
        outcome: 'form-broken',
        detail: 'no [data-testid="amount-input"] on the invoice page',
      }
    }
    await page.type('[data-testid="amount-input"]', amountText)
    await page.bringToFront()
    const t0 = Date.now()
    await page.click('[data-testid="save-button"]')

    // The race window is real only once the action reaches the server:
    // wait for the provider client's 'start' audit line (not a blind sleep).
    const started = await pollForLogEntry(
      (e) => e.phase === 'start' && sameAmount(e.amount, amountText),
      5_000
    )
    if (!started) {
      return {
        amountText,
        outcome: 'form-broken',
        detail:
          'clicking Save never produced a provider start audit line — the form no longer dispatches the capture',
      }
    }
    initiatedSaves.push(amountText)

    // Click the payments link while the 1500ms capture is still in flight
    // (we are ~100ms in; the capture ends ~1500ms after start).
    await page.bringToFront()
    const tClick = Date.now()
    await page.click('[data-testid="view-payments-link"]')

    // Poll the page: first for arrival on /payments (a nav-gating solution
    // may legitimately delay this until the save settles), then for a
    // visible row carrying this trial's amount.
    let navAt: number | undefined
    let rowAt: number | undefined
    let lastRows: (string | null)[] = []
    const deadline = tClick + 20_000
    while (Date.now() < deadline) {
      const state = (await page.evaluate((needle: string) => {
        const rows = Array.from(
          document.querySelectorAll('[data-testid="payment-row"]')
        )
        return {
          path: location.pathname,
          rows: rows.map((el) => el.textContent),
          hasNeedle: rows.some(
            (el) =>
              (el.textContent ?? '').includes(needle) &&
              ((el as any).checkVisibility
                ? (el as any).checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                  })
                : true)
          ),
        }
      }, amountText)) as {
        path: string
        rows: (string | null)[]
        hasNeedle: boolean
      }
      lastRows = state.rows
      const now = Date.now()
      if (navAt === undefined && state.path === '/payments') navAt = now
      // The nav must land within 15s of the user's click even when gated.
      if (navAt === undefined && now - tClick > 15_000) break
      if (state.hasNeedle) {
        rowAt = now
        break
      }
      await sleep(100)
    }

    if (navAt === undefined) {
      return {
        amountText,
        outcome: 'stuck',
        detail: `the click on the payments link never landed on /payments within 15s — the navigation was blocked or swallowed`,
      }
    }
    if (rowAt === undefined) {
      return {
        amountText,
        outcome: 'stale',
        detail: `/payments rendered without the just-saved payment and never corrected itself; rows seen: ${JSON.stringify(lastRows)}`,
        saveToNavMs: navAt - t0,
      }
    }
    // Reject optimistic phantoms: at the moment the row is visible, the
    // payment must actually exist in data/payments.json.
    const onDisk = diskPayments().some(
      (p) => sameAmount(p.amount, amountText) && p.invoiceId === 'inv-1042'
    )
    if (!onDisk) {
      return {
        amountText,
        outcome: 'phantom',
        detail:
          'a row was shown before the payment existed in data/payments.json — optimistic UI without a committed record re-creates the reported bug on reload',
        saveToNavMs: navAt - t0,
        saveToRowMs: rowAt - t0,
      }
    }
    return {
      amountText,
      outcome: 'fresh',
      detail: '',
      saveToNavMs: navAt - t0,
      saveToRowMs: rowAt - t0,
    }
  } finally {
    try {
      await page.close()
    } catch {}
  }
}

const raceTrials: RaceTrial[] = []

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Fresh data the agent's turn never saw, and an empty audit log.
  writeFileSync(PAYMENTS_FILE, baselinePaymentsJson())
  writeFileSync(LOG_FILE, '')

  if (await portAnswers()) {
    // Kill strays on OUR port only (never pattern-kill next processes —
    // other suites run live servers on this machine).
    try {
      const pids = execSync(`lsof -ti tcp:${PORT}`)
        .toString()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      for (const pid of pids) {
        try {
          process.kill(Number(pid), 'SIGKILL')
        } catch {}
      }
    } catch {}
    await sleep(1500)
    if (await portAnswers()) {
      throw new Error(
        `Something already answers on port ${PORT}; refusing to run against an unknown server.`
      )
    }
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
// A. RACE: save, click the payments link mid-save — the row must appear
// ---------------------------------------------------------------------------

test(
  'a payment saved and navigated-to mid-save appears in the payments list',
  async () => {
    for (const amount of RACE_AMOUNTS) {
      raceTrials.push(await runRaceTrial(amount))
    }
    const summary = raceTrials
      .map(
        (t) =>
          `$${t.amountText}: ${t.outcome}` +
          (t.saveToRowMs !== undefined ? ` (row at +${t.saveToRowMs}ms)` : '') +
          (t.detail ? ` — ${t.detail}` : '')
      )
      .join('\n  ')
    for (const t of raceTrials) {
      expect(
        t.outcome,
        `race trial $${t.amountText} ended '${t.outcome}'.\nAll trials:\n  ${summary}`
      ).toBe('fresh')
    }
  },
  300_000
)

// ---------------------------------------------------------------------------
// B. CONTROL: waiting for the save, then navigating, must still work
// ---------------------------------------------------------------------------

test(
  'the normal path — save, wait for it to finish, then navigate — still shows the new payment',
  async () => {
    if (!browser) throw new Error('browser did not launch')
    const page = await browser.newPage()
    try {
      await page.goto(INVOICE_URL, { waitUntil: 'load' })
      await page.bringToFront()
      await page.waitForSelector('[data-testid="amount-input"]', {
        timeout: 15_000,
      })
      await page.type('[data-testid="amount-input"]', CONTROL_AMOUNT)
      await page.bringToFront()
      const t0 = Date.now()
      await page.click('[data-testid="save-button"]')

      const started = await pollForLogEntry(
        (e) => e.phase === 'start' && sameAmount(e.amount, CONTROL_AMOUNT),
        5_000
      )
      expect(
        started,
        'clicking Save never produced a provider start audit line'
      ).toBeTruthy()
      initiatedSaves.push(CONTROL_AMOUNT)

      const ended = await pollForLogEntry(
        (e) => e.phase === 'end' && sameAmount(e.amount, CONTROL_AMOUNT),
        10_000
      )
      expect(
        ended,
        'the save never completed (no provider end audit line within 10s)'
      ).toBeTruthy()
      // EVAL's own clock: the capture must have taken the provider's real
      // latency — kills sleep-shortening and fabricated audit lines.
      expect(
        Date.now() - t0,
        'the save completed faster than the provider latency allows'
      ).toBeGreaterThanOrEqual(1400)

      // Let the client finish processing the action response before
      // navigating (this is the deliberate NON-racing path).
      await sleep(1200)

      await page.bringToFront()
      await page.click('[data-testid="view-payments-link"]')
      await page.waitForFunction(
        (needle: string) => {
          if (location.pathname !== '/payments') return false
          const rows = Array.from(
            document.querySelectorAll('[data-testid="payment-row"]')
          )
          return rows.some(
            (el) =>
              (el.textContent ?? '').includes(needle) &&
              ((el as any).checkVisibility
                ? (el as any).checkVisibility({
                    checkOpacity: true,
                    checkVisibilityCSS: true,
                  })
                : true)
          )
        },
        { timeout: 15_000, polling: 100 },
        CONTROL_AMOUNT
      )
      expect(
        diskPayments().some(
          (p) => sameAmount(p.amount, CONTROL_AMOUNT) && p.invoiceId === 'inv-1042'
        ),
        'the control payment is missing from data/payments.json'
      ).toBe(true)
    } finally {
      try {
        await page.close()
      } catch {}
    }
  },
  120_000
)

// ---------------------------------------------------------------------------
// C. INTEGRITY: every save went through the provider client, full latency
// ---------------------------------------------------------------------------

test('every save ran through the provider client with its real latency and landed in payments.json', () => {
  expect(
    initiatedSaves.length,
    'fewer than 4 saves reached the server across the RACE and CONTROL flows'
  ).toBeGreaterThanOrEqual(4)
  const entries = logEntries()
  const disk = diskPayments()
  for (const amountText of initiatedSaves) {
    const start = entries.find(
      (e) => e.phase === 'start' && sameAmount(e.amount, amountText)
    )
    const end = entries.find(
      (e) => e.phase === 'end' && sameAmount(e.amount, amountText)
    )
    expect(start, `no provider start audit line for $${amountText}`).toBeTruthy()
    expect(end, `no provider end audit line for $${amountText}`).toBeTruthy()
    const elapsed = (end?.ts ?? 0) - (start?.ts ?? 0)
    expect(
      elapsed,
      `the provider capture for $${amountText} took ${elapsed}ms — the 1.5s provider latency was bypassed`
    ).toBeGreaterThanOrEqual(1400)
    expect(
      disk.some(
        (p) => sameAmount(p.amount, amountText) && p.invoiceId === 'inv-1042'
      ),
      `$${amountText} is missing from data/payments.json`
    ).toBe(true)
  }
})

// ---------------------------------------------------------------------------
// D. The integrations-team client is unmodified
// ---------------------------------------------------------------------------

test('lib/payments-core.ts (the integrations-team client) is unmodified', () => {
  const FROZEN_PAYMENTS_CORE = `
// lib/payments-core.ts — the integrations team's payment-provider client.
// DO NOT MODIFY THIS FILE. It mirrors the provider's real end-to-end capture
// latency (measured from production traces) and appends one NDJSON audit line
// to data/payments-log.ndjson at the start and end of every capture so the
// integrations team can reconcile our records against the provider's own logs.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PaymentRecord {
  id: string
  invoiceId: string
  amount: number
  capturedAt: number
}

const DATA_DIR = join(process.cwd(), 'data')
const PAYMENTS_FILE = join(DATA_DIR, 'payments.json')
const LOG_FILE = join(DATA_DIR, 'payments-log.ndjson')

function audit(phase: 'start' | 'end', invoiceId: string, amount: number) {
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ phase, ts: Date.now(), invoiceId, amount }) + '\\n'
  )
}

function providerLatency() {
  // Capturing a payment with the provider takes about 1.5 seconds end to end.
  return new Promise((resolve) => setTimeout(resolve, 1500))
}

export function readPayments(): PaymentRecord[] {
  const raw = readFileSync(PAYMENTS_FILE, 'utf8')
  return (JSON.parse(raw) as { payments: PaymentRecord[] }).payments
}

export async function capturePayment(
  invoiceId: string,
  amount: number
): Promise<PaymentRecord> {
  audit('start', invoiceId, amount)
  await providerLatency()
  const payment: PaymentRecord = {
    id: 'pay_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    invoiceId,
    amount,
    capturedAt: Date.now(),
  }
  const payments = readPayments()
  payments.push(payment)
  writeFileSync(PAYMENTS_FILE, JSON.stringify({ payments }, null, 2) + '\\n')
  audit('end', invoiceId, amount)
  return payment
}
`
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  expect(normalize(read(join(ROOT, 'lib', 'payments-core.ts')))).toBe(
    normalize(FROZEN_PAYMENTS_CORE)
  )
})

// ---------------------------------------------------------------------------
// E. Kept contract: testids, real client-side Links, no full-reload escape
// ---------------------------------------------------------------------------

test('the payment form is still a client component carrying the smoke-test testids', () => {
  const clientFiles = sourceFiles().filter((f) =>
    /['"]use client['"]/.test(stripComments(read(f)))
  )
  for (const id of ['amount-input', 'save-button', 'save-status']) {
    const re = new RegExp(
      `data-testid\\s*=\\s*(?:["']${id}["']|\\{\\s*["']${id}["']\\s*\\})`
    )
    expect(
      clientFiles.some((f) => re.test(read(f))),
      `no 'use client' source file renders data-testid="${id}"`
    ).toBe(true)
  }
})

test('the payments link and rows keep their testids, and next/link stays in use', () => {
  const files = sourceFiles()
  for (const id of ['view-payments-link', 'payment-row']) {
    const re = new RegExp(
      `data-testid\\s*=\\s*(?:["']${id}["']|\\{\\s*["']${id}["']\\s*\\})`
    )
    expect(
      files.some((f) => re.test(read(f))),
      `no source file renders data-testid="${id}"`
    ).toBe(true)
  }
  const usesNextLink = files.some((f) => {
    const src = stripComments(read(f))
    return (
      /from\s+['"]next\/link['"]/.test(src) ||
      /require\(\s*['"]next\/link['"]\s*\)/.test(src) ||
      /import\(\s*['"]next\/link['"]\s*\)/.test(src)
    )
  })
  expect(
    usesNextLink,
    'no source file imports next/link — navigation must stay client-side'
  ).toBe(true)
})

test('no full-page-reload escape hatch', () => {
  // The prompt requires client-side navigation. Forcing a document reload
  // (window.location / location.href / location.reload) would trivially
  // "fix" the symptom by abandoning the client router, so it is banned.
  // Checked on comment-stripped source so prose mentions don't trip it.
  for (const f of sourceFiles()) {
    const src = stripComments(read(f))
    expect(
      /window\s*\.\s*location/.test(src) ||
        /document\s*\.\s*location/.test(src) ||
        /\blocation\s*\.\s*(assign|replace|reload)\s*\(/.test(src) ||
        /\blocation\s*\.\s*href\s*=/.test(src),
      `${f} navigates via a full page reload (window.location/location.*) — navigation must stay client-side`
    ).toBe(false)
  }
})

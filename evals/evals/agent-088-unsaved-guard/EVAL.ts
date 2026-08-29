/**
 * next/link's `onNavigate` fires ONLY for actual SPA navigations — modified
 * clicks never reach it (Next.js 16.4.0-canary.10, verified empirically
 * 2026-08 in headless Chromium on both darwin and linux).
 *
 * Target semantic: in packages/next/src/client/app-dir/link.tsx, the click
 * handler returns for modified events (metaKey / ctrlKey / shiftKey / altKey /
 * middle button / non-_self target / download attr) BEFORE calling
 * e.preventDefault() and BEFORE invoking `onNavigate`. So an unsaved-changes
 * guard implemented as onNavigate(e => { if (dirty && !confirm(...))
 * e.preventDefault() }) intercepts exactly the in-app SPA navigations and
 * never touches open-in-new-tab gestures.
 *
 * FOLKLORE WRONG PATHS this eval targets:
 *  (a) onClick={e => { if (dirty && !confirm(...)) e.preventDefault() }} —
 *      React's onClick fires for cmd/ctrl-clicks too, so the naive guard
 *      shows a dialog on open-in-new-tab and, when cancelled, swallows the
 *      new tab entirely.
 *  (b) beforeunload — never fires for client-side route transitions, so the
 *      guard is silently absent for every in-app link (drafts are lost).
 * A *careful* onClick that returns early for e.metaKey/e.ctrlKey/e.shiftKey/
 * e.altKey/e.button !== 0 also satisfies every assertion here — that is
 * legitimate engineering and is accepted; only the naive folklore fails.
 *
 * Headless fingerprints (spiked on this canary, prod build + next start):
 *  - new-tab modifier is platform-specific: Meta on darwin (Control+click is
 *    converted by Blink on mac into a contextmenu event and the click never
 *    fires), Control on linux (Meta+click there is a plain same-tab nav).
 *  - correct guard, modifier+click: NO dialog event, browser fires
 *    targetcreated for a same-origin page at the link's href, current tab URL
 *    unchanged, draft text intact.
 *  - naive onClick guard, modifier+click with auto-dismissed confirm: one
 *    'confirm' dialog event, NO targetcreated, URL unchanged.
 *  - beforeunload-only guard, plain click while dirty: zero dialog events and
 *    the tab navigates away (the draft is gone).
 *
 * Why agents fail: the dialog "works" on a plain click for both wrong paths'
 * cousins — the naive onClick demo looks perfect unless you actually
 * cmd+click it, and agents rarely drive a real browser with modifier keys
 * mid-task. beforeunload is the classic MPA reflex and shows a native dialog
 * on tab close, which reads as success.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4090
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const EDITOR_PATH = '/notes/1'
const MARKER = 'guard-eval-88'
// Open-in-new-tab modifier for headless Chromium on this host: cmd on mac
// (ctrl+click is a context-menu gesture there and never delivers a click),
// ctrl elsewhere (meta+click on linux is just a same-tab navigation).
const NEW_TAB_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'

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

/** lsof-only precheck: never probes the port with a request. */
function portInUse(): boolean {
  try {
    const out = execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN`, {
      stdio: 'pipe',
    }).toString()
    return out.trim().length > 0
  } catch {
    // lsof exits non-zero when nothing listens (or lsof is unavailable).
    return false
  }
}

// ---------------------------------------------------------------------------
// Headless browser: full puppeteer locally, puppeteer-core + sparticuz in the
// sandbox (mechanism proven in-sandbox by the b9 infrastructure spike).
// ---------------------------------------------------------------------------

interface Dialog {
  type(): string
  message(): string
  accept(): Promise<unknown>
  dismiss(): Promise<unknown>
}

interface TargetLike {
  url(): string
  page(): Promise<{ close(): Promise<void> } | null>
}

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
  type(sel: string, text: string): Promise<void>
  $eval<T>(sel: string, fn: (el: any) => T): Promise<T>
  evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T>
  url(): string
  keyboard: { down(key: string): Promise<void>; up(key: string): Promise<void> }
  on(event: 'dialog', handler: (d: Dialog) => void): void
  close(): Promise<void>
}

interface Browser {
  newPage(): Promise<Page>
  on(event: 'targetcreated', handler: (t: TargetLike) => void): void
  off(event: 'targetcreated', handler: (t: TargetLike) => void): void
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
// Click trials
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface TrialOpts {
  linkTestId: 'nav-notes' | 'nav-settings'
  /** Save the draft (via the save button) before clicking, i.e. click clean. */
  saveFirst?: boolean
  /** Hold the platform's open-in-new-tab modifier during the click. */
  modified?: boolean
  dialogAction: 'accept' | 'dismiss'
}

interface Trial {
  dialogs: { type: string; message: string }[]
  /** Pathname of the trial page after the outcome window. */
  finalPath: string
  /** Pathname of a newly created same-origin target (new tab), if any. */
  newTabPath: string | null
  /** Textarea value at the end (empty string if it is gone). */
  textareaValue: string
}

async function currentPath(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => location.pathname)
  } catch {
    try {
      return new URL(page.url()).pathname
    } catch {
      return ''
    }
  }
}

async function clickTrial(opts: TrialOpts): Promise<Trial> {
  if (!browser) throw new Error('browser did not launch')
  const page = await browser.newPage()
  const dialogs: { type: string; message: string }[] = []
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message() })
    try {
      if (opts.dialogAction === 'accept') await d.accept()
      else await d.dismiss()
    } catch {}
  })
  const created: TargetLike[] = []
  const onTarget = (t: TargetLike) => created.push(t)
  browser.on('targetcreated', onTarget)
  try {
    await page.goto(BASE + EDITOR_PATH, { waitUntil: 'networkidle0' })
    await page.bringToFront()
    await page.waitForSelector('[data-testid="note-textarea"]', {
      timeout: 15_000,
    })
    await page.waitForSelector(`[data-testid="${opts.linkTestId}"]`, {
      timeout: 15_000,
    })
    const visible = await page.$eval('[data-testid="note-textarea"]', (el) =>
      el.checkVisibility()
    )
    if (!visible) throw new Error('the note textarea is not visible')

    // Dirty the draft by typing. Waiting for the save-state indicator to
    // change (any text change — its wording is the agent's business) proves
    // both hydration and that the edit registered with React. Retried because
    // a click that lands before hydration types dead characters.
    const cleanText = await page.$eval(
      '[data-testid="save-state"]',
      (el) => el.textContent ?? ''
    )
    let dirtied = false
    for (let attempt = 0; attempt < 3 && !dirtied; attempt++) {
      await page.click('[data-testid="note-textarea"]')
      await page.type('[data-testid="note-textarea"]', MARKER)
      try {
        await page.waitForFunction(
          (marker: string, clean: string) => {
            const ta = document.querySelector(
              '[data-testid="note-textarea"]'
            ) as HTMLTextAreaElement | null
            const ss = document.querySelector('[data-testid="save-state"]')
            return (
              !!ta &&
              ta.value.includes(marker) &&
              !!ss &&
              (ss.textContent ?? '') !== clean
            )
          },
          { timeout: 4000, polling: 50 },
          MARKER,
          cleanText
        )
        dirtied = true
      } catch {}
    }
    if (!dirtied) {
      throw new Error(
        'typing into the note textarea never flipped the save-state ' +
          'indicator — the editor is not interactive'
      )
    }

    if (opts.saveFirst) {
      await page.click('[data-testid="save-button"]')
      await page.waitForFunction(
        (clean: string) => {
          const ss = document.querySelector('[data-testid="save-state"]')
          return !!ss && (ss.textContent ?? '') === clean
        },
        { timeout: 8000, polling: 50 },
        cleanText
      )
    }

    if (opts.modified) {
      await page.keyboard.down(NEW_TAB_KEY)
      await page.click(`[data-testid="${opts.linkTestId}"]`)
      await page.keyboard.up(NEW_TAB_KEY)
    } else {
      await page.click(`[data-testid="${opts.linkTestId}"]`)
    }

    // Outcome window: wait until the tab leaves the editor or a same-origin
    // target appears; a guarded-and-cancelled click legitimately reaches the
    // cap with neither.
    const sameOriginTab = (): string | null => {
      for (const t of created) {
        const u = t.url()
        if (u && u.startsWith(BASE)) return new URL(u).pathname
      }
      return null
    }
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      if (sameOriginTab() !== null) break
      if ((await currentPath(page)) !== EDITOR_PATH) break
      await sleep(100)
    }
    // Settle: late dialogs, the new tab finishing its initial about:blank
    // phase, or the SPA URL update landing.
    await sleep(750)
    const newTabPath = sameOriginTab()
    const finalPath = await currentPath(page)
    let textareaValue = ''
    try {
      textareaValue = await page.$eval(
        '[data-testid="note-textarea"]',
        (el) => el.value ?? ''
      )
    } catch {}
    return { dialogs, finalPath, newTabPath, textareaValue }
  } finally {
    browser.off('targetcreated', onTarget)
    for (const t of created) {
      try {
        const p = await t.page()
        await p?.close()
      } catch {}
    }
    try {
      await page.close()
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (portInUse()) {
    throw new Error(
      `Something already listens on port ${PORT}; refusing to run against an unknown server.`
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
      const res = await fetch(BASE + EDITOR_PATH, {
        signal: AbortSignal.timeout(1000),
      })
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
// A. Dirty + plain click + cancel: the guard holds the tab and the draft
// ---------------------------------------------------------------------------

test(
  'cancelling the confirm on a plain click keeps the editor and the draft',
  async () => {
    const t = await clickTrial({
      linkTestId: 'nav-settings',
      dialogAction: 'dismiss',
    })
    expect(
      t.dialogs.length,
      'clicking Settings with unsaved edits never showed a confirmation dialog'
    ).toBeGreaterThanOrEqual(1)
    expect(
      t.dialogs.some((d) => d.type === 'confirm'),
      `expected a window.confirm dialog, saw: ${JSON.stringify(t.dialogs)}`
    ).toBe(true)
    expect(
      t.finalPath,
      'cancelling the dialog still navigated away from the editor'
    ).toBe(EDITOR_PATH)
    expect(
      t.textareaValue,
      'the draft text was lost even though the user cancelled'
    ).toContain(MARKER)
  },
  120_000
)

// ---------------------------------------------------------------------------
// B. Dirty + plain click + confirm: navigation proceeds
// ---------------------------------------------------------------------------

test(
  'accepting the confirm on a plain click navigates to the link target',
  async () => {
    const t = await clickTrial({
      linkTestId: 'nav-settings',
      dialogAction: 'accept',
    })
    expect(
      t.dialogs.length,
      'clicking Settings with unsaved edits never showed a confirmation dialog'
    ).toBeGreaterThanOrEqual(1)
    expect(
      t.finalPath,
      'accepting the dialog did not actually leave the editor'
    ).toBe('/settings')
  },
  120_000
)

// ---------------------------------------------------------------------------
// C. Dirty + open-in-new-tab click: browser default, untouched (money test)
// ---------------------------------------------------------------------------

test(
  `open-in-new-tab (${NEW_TAB_KEY}+click) with unsaved edits is never intercepted`,
  async () => {
    const t = await clickTrial({
      linkTestId: 'nav-notes',
      modified: true,
      dialogAction: 'dismiss',
    })
    expect(
      t.dialogs.length,
      `an open-in-new-tab click was intercepted by the guard: it showed ` +
        `${JSON.stringify(t.dialogs)} — cmd/ctrl+click must never see a dialog`
    ).toBe(0)
    expect(
      t.newTabPath,
      'no new tab was opened for the modifier+click — the browser default was prevented'
    ).toBe('/notes')
    expect(
      t.finalPath,
      'the current tab navigated away on an open-in-new-tab click'
    ).toBe(EDITOR_PATH)
    expect(
      t.textareaValue,
      'the draft in the current tab was lost by an open-in-new-tab click'
    ).toContain(MARKER)
  },
  120_000
)

// ---------------------------------------------------------------------------
// D. Clean (saved) + plain click: no dialog, normal navigation
// ---------------------------------------------------------------------------

test(
  'after saving, a plain click navigates with no dialog',
  async () => {
    const t = await clickTrial({
      linkTestId: 'nav-notes',
      saveFirst: true,
      dialogAction: 'dismiss',
    })
    expect(
      t.dialogs.length,
      `a click with no unsaved edits still showed ${JSON.stringify(t.dialogs)}`
    ).toBe(0)
    expect(
      t.finalPath,
      'a clean click on All notes did not navigate'
    ).toBe('/notes')
  },
  120_000
)

// ---------------------------------------------------------------------------
// E. Source integrity: testids and real next/link links are kept
// ---------------------------------------------------------------------------

test('the editor keeps its testids and real next/link links', () => {
  const sources = sourceFiles().map((f) => stripComments(read(f)))
  for (const id of [
    'note-textarea',
    'save-state',
    'save-button',
    'nav-notes',
    'nav-settings',
  ]) {
    const re = new RegExp(
      `data-testid\\s*=\\s*(?:["']${id}["']|\\{\\s*["']${id}["']\\s*\\})`
    )
    expect(
      sources.some((s) => re.test(s)),
      `no source file renders data-testid="${id}"`
    ).toBe(true)
  }
  const linkRe =
    /from\s+['"]next\/link['"]|require\(\s*['"]next\/link['"]\s*\)/
  expect(
    sources.some((s) => linkRe.test(s)),
    'no source file imports next/link — the navigation must stay real Links'
  ).toBe(true)
})

/**
 * io() — the dynamic-by-construction boundary that caches can still swallow
 * (Next.js 16.4.0-canary.10, cacheComponents: true — verified 2026-08-28)
 *
 * Target semantic: `io()` from 'next/cache' (flag landed e22dc27d8f
 * 2026-04-08, since stabilized) marks "real IO happens after this point".
 * During a prerender it returns a hanging promise, so everything after it
 * becomes dynamic (a PPR hole under the nearest Suspense boundary) — like
 * `connection()` — BUT unlike `connection()` it needs no HTTP request and
 * resolves immediately inside 'use cache' scopes and client components. That
 * makes it the only request-API-free way to build a shared helper that is
 * dynamic by construction while remaining usable inside caches.
 *
 * Empirically verified on this canary (spike, production build + start):
 * - helper with `await io()`: build green; /live is ◐ Partial Prerender whose
 *   shell HTML contains the Suspense fallback and zero occurrences of the
 *   ticker value; two GETs stream different stamps. /report ('use cache' +
 *   cacheLife({revalidate:600}) around the same helper) is ○ static,
 *   initialRevalidateSeconds 600, identical stamps across GETs.
 * - helper with `await connection()` instead: build FAILS on the report page:
 *   'Route /report used `connection()` inside "use cache". The `connection()`
 *   function is used to indicate the subsequent code must only run when there
 *   is an actual request, but caches must be able to be produced before a
 *   request, so this function is not allowed in this scope. See more info
 *   here: https://nextjs.org/docs/messages/next-request-in-use-cache'
 *   The full build output contains no mention of io().
 * - helper with no marker (the pristine state): build is GREEN and the quote
 *   is silently frozen into the prerendered /live HTML — every visitor sees
 *   the same stamp.
 * - helper computing Date.now() with no marker: build fails with the sync-IO
 *   error whose fix list recommends `await connection()` (and "use cache" /
 *   "use client") — a breadcrumb that leads straight into the use-cache trap
 *   above. It never mentions io().
 * - unstable_noStore(): documented noop under cacheComponents — build stays
 *   green and the value stays frozen (non-fix).
 * - `export const dynamic = 'force-dynamic'`: build error, route segment
 *   config is incompatible with cacheComponents.
 *
 * Why agents fail: a 2025-trained agent knows connection()/headers()/
 * noStore(), all of which either explode inside the cached report loader or
 * do nothing under cacheComponents, and the framework's own error messages
 * recommend connection() — nothing in the repo or the errors names io().
 *
 * Requirement 3 (the mechanism must live inside the shared helper, so any
 * future call site is safe with zero extra steps) is enforced BEHAVIORALLY:
 * beforeAll writes a brand-new probe page that just Suspense-wraps a direct
 * getFreshQuote() call; its prerendered shell must contain no payload and two
 * live requests must produce different payloads. This accepts every genuine
 * in-helper dynamic boundary (verified: awaited real IO such as a setTimeout
 * sleep also passes) and rejects every call-site-only fix, without banning or
 * requiring any API by name.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4071
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()

const PROBE_ROUTE = 'quote-probe-e71'
const PROBE_DIR = join(ROOT, 'app', PROBE_ROUTE)
const PROBE_PAGE = join(PROBE_DIR, 'page.tsx')
const PROBE_SOURCE = `import { Suspense } from 'react'
import { getFreshQuote } from '../../lib/quote'

async function ProbeValue() {
  const quote = await getFreshQuote()
  return <span data-testid="probe-payload">{JSON.stringify(quote)}</span>
}

export default function QuoteProbePage() {
  return (
    <main>
      <h1>Quote probe</h1>
      <Suspense fallback={<p>probe pending</p>}>
        <ProbeValue />
      </Suspense>
    </main>
  )
}
`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function extractTestId(html: string, id: string): string | null {
  const m = html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`))
  return m ? m[1] : null
}

async function getPage(path: string): Promise<string> {
  const res = await fetch(BASE + path, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status !== 200) {
    throw new Error(`GET ${path} responded with ${res.status}`)
  }
  return res.text()
}

// ---------------------------------------------------------------------------
// Production build + start on PORT
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

beforeAll(async () => {
  if (await portAnswers()) {
    throw new Error(
      `Something already answers on port ${PORT}; refusing to run against an unknown server.`
    )
  }

  // A brand-new call site, written before the build: it does nothing but
  // Suspense-wrap a direct getFreshQuote() call. If the helper is safe by
  // construction, this page prerenders as a shell with a hole and produces a
  // fresh payload per request — with zero extra steps taken here.
  mkdirSync(PROBE_DIR, { recursive: true })
  writeFileSync(PROBE_PAGE, PROBE_SOURCE)

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
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      try {
        server.kill('SIGKILL')
      } catch {}
    }
  }
  try {
    rmSync(PROBE_DIR, { recursive: true, force: true })
  } catch {}
})

// ---------------------------------------------------------------------------
// Requirement 4: the live page keeps its instantly-served shell — and the
// quote is no longer baked into it.
// ---------------------------------------------------------------------------

test('the prerendered live shell has the placeholder but no baked-in quote', () => {
  const shellPath = join(ROOT, '.next', 'server', 'app', 'live.html')
  expect(
    existsSync(shellPath),
    '/live must still be prerendered to a static shell (.next/server/app/live.html)'
  ).toBe(true)
  const shell = read(shellPath)
  expect(
    shell,
    'the live shell must still contain the placeholder (data-testid="live-fallback")'
  ).toMatch(/data-testid="live-fallback"/)
  expect(
    shell,
    'the quote must NOT be baked into the prerendered shell — the ticker has to stream in at request time'
  ).not.toMatch(/data-testid="live-stamp"/)
})

// ---------------------------------------------------------------------------
// Requirement 1: per-request live values.
// ---------------------------------------------------------------------------

test(
  'two visitors seconds apart see different live stamps',
  async () => {
    const first = extractTestId(await getPage('/live'), 'live-stamp')
    const second = extractTestId(await getPage('/live'), 'live-stamp')
    expect(first, 'first /live response must stream a live-stamp value').toBeTruthy()
    expect(second, 'second /live response must stream a live-stamp value').toBeTruthy()
    expect(second).not.toBe(first)
  },
  120_000
)

// ---------------------------------------------------------------------------
// Requirement 2: the report stays cached.
// ---------------------------------------------------------------------------

test(
  'repeat report requests serve the identical cached value',
  async () => {
    const first = extractTestId(await getPage('/report'), 'report-stamp')
    const second = extractTestId(await getPage('/report'), 'report-stamp')
    expect(first, 'first /report response must render a report-stamp value').toBeTruthy()
    expect(second, 'second /report response must render a report-stamp value').toBeTruthy()
    expect(second).toBe(first)
  },
  120_000
)

test('the report recomputes at most once per 10 minutes', () => {
  const manifest = JSON.parse(
    read(join(ROOT, '.next', 'prerender-manifest.json'))
  ) as {
    routes: Record<string, { initialRevalidateSeconds?: number | false }>
  }
  const entry = manifest.routes['/report']
  expect(
    entry,
    '/report must still be prerendered (present in prerender-manifest.json)'
  ).toBeTruthy()
  const revalidate = entry.initialRevalidateSeconds
  expect(
    revalidate === false ||
      (typeof revalidate === 'number' && revalidate >= 600),
    `/report revalidates every ${String(revalidate)}s — more than once per 10 minutes`
  ).toBe(true)
})

// ---------------------------------------------------------------------------
// Requirement 3: the mechanism lives in the helper. A brand-new page that
// just calls getFreshQuote() (written in beforeAll, before the build, with
// zero call-site steps) must be per-request safe.
// ---------------------------------------------------------------------------

test('a brand-new call site is safe with zero extra steps: nothing baked into its shell', () => {
  const shellPath = join(ROOT, '.next', 'server', 'app', `${PROBE_ROUTE}.html`)
  expect(
    existsSync(shellPath),
    'the probe page must prerender to a static shell'
  ).toBe(true)
  expect(
    read(shellPath),
    'the probe value was baked into the build — a call site that just calls getFreshQuote() is still unsafe'
  ).not.toMatch(/data-testid="probe-payload"/)
})

test(
  'a brand-new call site is safe with zero extra steps: fresh value per request',
  async () => {
    const first = extractTestId(await getPage(`/${PROBE_ROUTE}`), 'probe-payload')
    const second = extractTestId(await getPage(`/${PROBE_ROUTE}`), 'probe-payload')
    expect(first, 'first probe response must stream a payload').toBeTruthy()
    expect(second, 'second probe response must stream a payload').toBeTruthy()
    expect(second).not.toBe(first)
  },
  120_000
)

// ---------------------------------------------------------------------------
// Source sanity: the shared helper survives, and nothing opted routes out.
// ---------------------------------------------------------------------------

test('lib/quote.ts still exists and exports getFreshQuote', () => {
  const helperPath = join(ROOT, 'lib', 'quote.ts')
  expect(
    existsSync(helperPath),
    'the shared helper must remain at lib/quote.ts'
  ).toBe(true)
  const src = stripComments(read(helperPath))
  const exported =
    /export\s+(async\s+)?function\s+getFreshQuote\b/.test(src) ||
    /export\s+const\s+getFreshQuote\b/.test(src) ||
    /export\s*\{[^}]*\bgetFreshQuote\b[^}]*\}/.test(src)
  expect(exported, 'lib/quote.ts must still export getFreshQuote').toBe(true)
})

test('cacheComponents stays enabled and no route segment opt-outs are used', () => {
  const configPath = ['next.config.ts', 'next.config.mjs', 'next.config.js']
    .map((f) => join(ROOT, f))
    .find((p) => existsSync(p))
  expect(configPath, 'a next.config file must exist').toBeTruthy()
  const config = stripComments(read(configPath as string))
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/cacheComponents\s*:\s*false/)

  for (const dir of ['app', 'lib']) {
    const root = join(ROOT, dir)
    if (!existsSync(root)) continue
    const walk = (p: string): string[] => {
      const out: string[] = []
      for (const d of readdirSync(p, { withFileTypes: true })) {
        const full = join(p, d.name)
        if (d.isDirectory()) {
          if (d.name === 'node_modules' || d.name === '.next') continue
          out.push(...walk(full))
        } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(d.name)) {
          out.push(full)
        }
      }
      return out
    }
    for (const f of walk(root)) {
      expect(
        stripComments(read(f)),
        `${f} must not use the "dynamic" route segment config`
      ).not.toMatch(/export\s+const\s+dynamic\b/)
    }
  }
})

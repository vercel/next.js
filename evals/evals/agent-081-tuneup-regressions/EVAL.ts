/**
 * COMPOSITE: prerender-inclusion stale floor × per-page dynamic router
 * retention (agent-081-tuneup-regressions)
 *
 * Composed from two gated, review-cleared evals whose discriminators are
 * complementary — per law-v5, an unsaturated eval should fail every tested
 * model for a reason the fixture can articulate. Each leg alone splits the
 * model pool; requiring BOTH semantics in one task projects to all-fail
 * while each leg stays individually solvable (each has two style-diverse
 * oracles).
 *
 * Leg 1 — agent-065-stale-shell (the `/` plan card): since 2026-06-12
 * (d0562082e9) and 2026-07-15 (83e99f0a2e), under `cacheComponents` the
 * `stale` field of cacheLife() is no longer a pure client-router freshness
 * knob: a cache scope whose `stale` is below MIN_PREFETCHABLE_STALE (30s) is
 * silently excluded from static prerenders — the built HTML contains the
 * Suspense fallback where the cached content used to be. Thresholds live in
 * packages/next/src/server/use-cache/constants.ts. The fix is pinned to
 * stale ∈ [30, 60] (>= 30 for prerender inclusion, <= 60 by the one-minute
 * reuse constraint); revalidate stays 600; a named cacheLife profile in
 * next.config.ts with stale in range is equally correct. Source-eval
 * per-model results: opus FAILED (wrote stale: Infinity, violating the
 * <= 1 min constraint); fable/sonnet solved via build-and-inspect probe
 * loops.
 *
 * Leg 2 — agent-072-dynamic-stale (the /orders list):
 * `unstable_dynamicStaleTime` page segment config (2026-03-16, #91437) is
 * the per-page client-router retention window for DYNAMIC data — the only
 * way to let one page's dynamic navigation response be reused on
 * bounce-back while the data stays per-request fresh on the server and
 * other pages keep default behavior. Source-eval per-model results:
 * fable/sonnet FAILED (reached for cacheLife()/'use cache' — breaks
 * per-request freshness — or prefetch='partial'); opus solved by grepping
 * the installed Next types for "stale".
 *
 * Fingerprints (verified on next 16.4.0-canary.10 in both source evals,
 * re-verified on this composed app):
 * - Leg 1: stale < 30 → `.next/server/app/index.html` contains
 *   `<template id="B:` plus the rendered fallback text and the price string
 *   is absent; stale >= 30 → price present, fallback text survives only
 *   inside the inlined Flight payload (<script> tags), so the visible-markup
 *   assertion strips <script> blocks first.
 * - Leg 2: when a page exports the segment config, the dynamic RSC
 *   navigation response (GET with `RSC: 1`) carries a top-level numeric
 *   `"d":<seconds>` field (NavigationFlightResponse.d, set in
 *   generateDynamicRSCPayload); absent without it (including with only the
 *   global experimental.staleTimes). All other `"d":` keys in the payload
 *   are object-valued render-tree nodes, so a numeric match is unambiguous.
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4083
const ORIGIN = `http://localhost:${PORT}`
const ROOT = process.cwd()
const HTML_PATH = join(ROOT, '.next', 'server', 'app', 'index.html')

let server: ChildProcess | undefined
let serverLog = ''

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

function read(p: string): string {
  return readFileSync(join(ROOT, p), 'utf-8')
}

function html(): string {
  return readFileSync(HTML_PATH, 'utf-8')
}

/**
 * Strips comments before applying ban-shape regexes so that prose merely
 * mentioning a banned name never fails a solution. Over-stripping (e.g.
 * `//` inside a string URL) can only relax a ban, never reject a legit fix.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function walkSourceFiles(): string[] {
  const out: string[] = []
  const entries = readdirSync(ROOT, { recursive: true, withFileTypes: true })
  for (const d of entries) {
    const parent = (d as any).parentPath ?? (d as any).path
    const full = join(parent, d.name)
    const rel = relative(ROOT, full)
    if (
      rel
        .split('/')
        .some(
          (s) =>
            s === 'node_modules' || s === '.next' || s === '__agent_eval__'
        )
    )
      continue
    if (!d.isFile()) continue
    if (!/\.(ts|tsx)$/.test(d.name)) continue
    // EVAL harness files are not part of the solution.
    if (/^EVAL/.test(rel)) continue
    out.push(rel)
  }
  return out
}

/** Solution files that may carry cache configuration (app/ and lib/). */
function appAndLibFiles(): string[] {
  return walkSourceFiles().filter(
    (rel) => rel.startsWith('app/') || rel.startsWith('lib/')
  )
}

function existingNextConfigs(): string[] {
  return [
    'next.config.ts',
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
  ].filter((p) => existsSync(join(ROOT, p)))
}

/** Evaluates "45", "0.5 * 60", "60 * 10" — NaN for anything else. */
function evalNumericExpr(expr: string): number {
  const parts = expr.split('*').map((p) => Number(p.trim()))
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return NaN
  return parts.reduce((a, b) => a * b, 1)
}

/** Resolves a value expression, following one level of const indirection. */
function resolveExpr(rawExpr: string, scope: string): number {
  const expr = rawExpr.trim().replace(/[;,]+$/, '').trim()
  const direct = evalNumericExpr(expr)
  if (!Number.isNaN(direct)) return direct
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const decl = scope.match(
      new RegExp(
        String.raw`\b(?:const|let|var)\s+` +
          expr.replace(/\$/g, '\\$') +
          String.raw`\s*(?::[^=\n]+)?=\s*([^;\n]+)`
      )
    )
    if (decl) return evalNumericExpr(decl[1].trim())
  }
  return NaN
}

/** All comment-stripped sources that may carry cache lifetime config. */
function cacheConfigSource(): string {
  const parts = appAndLibFiles().map((f) => read(f))
  for (const p of existingNextConfigs()) {
    parts.push(read(p))
  }
  return stripComments(parts.join('\n'))
}

/** Numeric values assigned to `<prop>:` anywhere in the given source. */
function collectPropValues(source: string, prop: string): number[] {
  const out: number[] = []
  const re = new RegExp(String.raw`\b${prop}\s*:\s*([^,}\n]+)`, 'g')
  for (const m of source.matchAll(re)) {
    const v = resolveExpr(m[1], source)
    if (!Number.isNaN(v)) out.push(v)
  }
  return out
}

async function fetchRsc(
  path: string
): Promise<{ status: number; body: string }> {
  // The router's dynamic navigation request. The server 307-redirects RSC
  // requests missing the `_rsc` cache-busting param; fetch follows it
  // same-origin with headers preserved.
  const res = await fetch(`${ORIGIN}${path}`, { headers: { RSC: '1' } })
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

const EXPORT_SHAPE = /export\s+(const|let|var)\s+unstable_dynamicStaleTime\b/

beforeAll(async () => {
  // Kill stray listeners from a previous run — targeted strictly by port.
  try {
    const pids = execSync(`lsof -ti tcp:${PORT}`, { stdio: 'pipe' })
      .toString()
      .trim()
    if (pids) {
      for (const pid of pids.split('\n')) {
        try {
          process.kill(Number(pid), 'SIGKILL')
        } catch {}
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  } catch {
    // lsof exits non-zero when nothing listens — port is free
  }

  // The agent's `.next` may be stale; always rebuild.
  rmSync(join(ROOT, '.next'), { recursive: true, force: true })
  execSync('node node_modules/next/dist/bin/next build', {
    stdio: 'pipe',
    env: cleanEnv(),
    cwd: ROOT,
    timeout: 600_000,
  })

  server = spawn(
    'node',
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    { env: cleanEnv(), cwd: ROOT, stdio: 'pipe', detached: true }
  )
  server.stdout?.on('data', (c) => (serverLog += String(c)))
  server.stderr?.on('data', (c) => (serverLog += String(c)))

  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      const res = await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) })
      if (res.status < 500) break
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      throw new Error(`next start never became ready on ${PORT}:\n${serverLog}`)
    }
    await new Promise((r) => setTimeout(r, 500))
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
})

// ---------------------------------------------------------------------------
// Leg 1 — behavioral (primary): the crawler-visible HTML artifact
// ---------------------------------------------------------------------------

test('built HTML contains the plan price (what the crawler sees)', () => {
  expect(html()).toContain('From $49/mo')
})

test('built HTML has no unfilled placeholder hole where the plan card belongs', () => {
  // The Flight payload inside <script> tags legitimately mentions the
  // fallback; only the visible markup matters.
  const visible = html().replace(/<script\b[\s\S]*?<\/script>/g, '')
  expect(visible).not.toMatch(/<template id="B:/)
  expect(visible).not.toContain('Checking current plan price')
})

// ---------------------------------------------------------------------------
// Leg 1 — source (secondary): the constraints the prompt pins
// ---------------------------------------------------------------------------

test('the plan price still comes from a shared public cache scope', () => {
  const cached = appAndLibFiles().filter((f) =>
    /['"]use cache['"]/.test(read(f))
  )
  expect(cached.length).toBeGreaterThan(0)
})

test('an explicit cache lifetime is still configured', () => {
  const withLife = appAndLibFiles().filter((f) =>
    /cacheLife\s*\(/.test(stripComments(read(f)))
  )
  expect(withLife.length).toBeGreaterThan(0)
})

test('client freshness window for the plan price is between 30 and 60 seconds', () => {
  const staleValues = collectPropValues(cacheConfigSource(), 'stale')
  expect(staleValues.length).toBeGreaterThan(0)
  for (const v of staleValues) {
    expect(v).toBeGreaterThanOrEqual(30)
    expect(v).toBeLessThanOrEqual(60)
  }
})

test('any named cacheLife profile in use resolves to a 30-60s freshness window', () => {
  const source = cacheConfigSource()
  const config = stripComments(
    existingNextConfigs()
      .map((p) => read(p))
      .join('\n')
  )
  const names = [...source.matchAll(/cacheLife\s*\(\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1]
  )
  for (const name of names) {
    const block = config.match(
      new RegExp(
        name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          String.raw`\s*:\s*\{([^}]*)\}`
      )
    )
    expect(block, `profile "${name}" must be defined in next config`).not
      .toBeNull()
    const stales = collectPropValues(block![1], 'stale')
    expect(
      stales.length,
      `profile "${name}" must set an explicit stale value`
    ).toBeGreaterThan(0)
    for (const v of stales) {
      expect(v).toBeGreaterThanOrEqual(30)
      expect(v).toBeLessThanOrEqual(60)
    }
  }
})

test('server refresh cadence for the plan price stays at exactly 10 minutes', () => {
  const values = collectPropValues(cacheConfigSource(), 'revalidate')
  expect(values.length).toBeGreaterThan(0)
  for (const v of values) {
    expect(v).toBe(600)
  }
})

test('no route was opted out of static rendering', () => {
  // Ban actual declarations by syntax shape on comment-stripped sources —
  // mere mentions in comments are fine.
  for (const f of walkSourceFiles()) {
    if (!f.startsWith('app/')) continue
    const src = stripComments(read(f))
    expect(src, `opt-out in ${f}`).not.toMatch(/export\s+const\s+dynamic\b/)
    expect(src, `opt-out in ${f}`).not.toMatch(/export\s+const\s+instant\b/)
    expect(src, `opt-out in ${f}`).not.toMatch(/instant\s*:\s*false/)
  }
})

// ---------------------------------------------------------------------------
// Shared config gate
// ---------------------------------------------------------------------------

test('no global router stale-time workaround; cache components stays on', () => {
  const configs = existingNextConfigs()
  expect(configs.length).toBeGreaterThan(0)
  for (const p of configs) {
    expect(stripComments(read(p)), `global staleTimes in ${p}`).not.toMatch(
      /\bstaleTimes\b\s*[:=]/
    )
  }
  expect(
    configs.some((p) =>
      /cacheComponents\s*:\s*true/.test(stripComments(read(p)))
    )
  ).toBe(true)
})

// ---------------------------------------------------------------------------
// Leg 2 — source: per-page retention config, scoped to the orders list
// ---------------------------------------------------------------------------

test('the orders list page opts into per-page router retention', () => {
  expect(read('app/orders/page.tsx')).toMatch(EXPORT_SHAPE)
})

test('the retention config is scoped to the orders list page only', () => {
  for (const rel of walkSourceFiles()) {
    if (rel === 'app/orders/page.tsx') continue
    expect(stripComments(read(rel)), `unexpected export in ${rel}`).not.toMatch(
      EXPORT_SHAPE
    )
  }
})

test('the orders list data path stays uncached (no shared caching)', () => {
  for (const p of ['app/orders/page.tsx', 'lib/orders.ts']) {
    if (!existsSync(join(ROOT, p))) continue
    expect(stripComments(read(p)), `'use cache' in ${p}`).not.toMatch(
      /['"]use cache['"]/
    )
  }
})

// ---------------------------------------------------------------------------
// Leg 2 — behavioral: the list stays dynamic, retention rides the payload
// ---------------------------------------------------------------------------

test(
  'the orders list stays dynamic: two visits render fresh data',
  async () => {
    const res1 = await fetch(`${ORIGIN}/orders`)
    const body1 = await res1.text()
    const res2 = await fetch(`${ORIGIN}/orders`)
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
    const { status, body } = await fetchRsc('/orders')
    expect(status).toBe(200)
    const ds = numericDValues(body)
    expect(
      ds.some((v) => v >= 90 && v <= 180),
      `expected a retention field between 90 and 180 seconds in the /orders flight payload, saw: [${ds.join(', ')}]`
    ).toBe(true)
  },
  120_000
)

test(
  "other pages keep today's behavior: no retention field on account or detail",
  async () => {
    for (const path of ['/', '/orders/1001']) {
      const { status, body } = await fetchRsc(path)
      expect(status).toBe(200)
      const ds = numericDValues(body)
      expect(ds, `unexpected retention field on ${path}`).toEqual([])
    }
  },
  120_000
)

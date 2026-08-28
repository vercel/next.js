/**
 * `unstable_dynamicStaleTime` page segment config (2026-03-16, #91437)
 *
 * Per-page client-router retention of DYNAMIC data: after navigating away
 * and back within the window, the router reuses the dynamic navigation
 * response instead of refetching. It is the per-page successor to the global
 * `experimental.staleTimes.dynamic` config, scoped to a single page file
 * (exporting it from a layout is a loud build error; combining it with
 * `instant` is too).
 *
 * Server-observable fingerprint (verified on 16.4.0-canary.10): when a page
 * exports the config, the dynamic RSC navigation response
 * (GET page with `RSC: 1`, following the `?_rsc` cache-buster redirect)
 * carries a top-level numeric `"d":<seconds>` field in the flight payload
 * (`NavigationFlightResponse.d`, set in generateDynamicRSCPayload). Without
 * the config — or with only the global `experimental.staleTimes` — the field
 * is absent. All other `"d":` keys in the payload are object-valued render
 * tree nodes, so a numeric match is unambiguous.
 *
 * Why agents fail: 2025-trained agents reach for the pre-Cache-Components
 * global `experimental.staleTimes` (still silently accepted in next.config —
 * builds green, no warning beyond the standard experiments listing, but it is
 * app-wide, not scoped to one page, and produces no per-page retention
 * field), for Router-Cache folklore, or for caching the data itself
 * ('use cache' / SWR), which breaks the "list stays per-request fresh"
 * requirement.
 */
import { test, expect, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

const PORT = 4072
const ORIGIN = `http://localhost:${PORT}`
const ROOT = process.cwd()

let server: ChildProcess | undefined
let serverLog = ''

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

function read(p: string): string {
  return readFileSync(join(ROOT, p), 'utf-8')
}

/**
 * Strips comments before applying ban-shape regexes so that prose merely
 * mentioning a banned name never fails a solution. Over-stripping (e.g.
 * `//` inside a string URL) can only relax a ban, never reject a legit fix.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function walkSourceFiles(): string[] {
  const out: string[] = []
  const entries = readdirSync(ROOT, { recursive: true, withFileTypes: true })
  for (const d of entries) {
    const parent = (d as any).parentPath ?? (d as any).path
    const full = join(parent, d.name)
    const rel = relative(ROOT, full)
    if (rel.split('/').some((s) => s === 'node_modules' || s === '.next'))
      continue
    if (!d.isFile()) continue
    if (!/\.(ts|tsx)$/.test(d.name)) continue
    // EVAL harness files are not part of the solution.
    if (/^EVAL/.test(rel)) continue
    out.push(rel)
  }
  return out
}

function existingNextConfigs(): string[] {
  return ['next.config.ts', 'next.config.js', 'next.config.mjs', 'next.config.cjs'].filter(
    (p) => existsSync(join(ROOT, p))
  )
}

async function fetchRsc(path: string): Promise<{ status: number; body: string }> {
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
  // Fail fast if something is already answering on our port.
  let portBusy = false
  try {
    await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) })
    portBusy = true
  } catch {
    // connection refused/timeout = free
  }
  if (portBusy) {
    throw new Error(`Port ${PORT} is already in use — refusing to start`)
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

test('no global router stale-time workaround; cache components stays on', () => {
  const configs = existingNextConfigs()
  expect(configs.length).toBeGreaterThan(0)
  for (const p of configs) {
    expect(stripComments(read(p)), `global staleTimes in ${p}`).not.toMatch(
      /\bstaleTimes\b\s*[:=]/
    )
  }
  expect(
    configs.some((p) => /cacheComponents\s*:\s*true/.test(stripComments(read(p))))
  ).toBe(true)
})

test('the orders list data path stays uncached (no shared caching)', () => {
  for (const p of ['app/orders/page.tsx', 'lib/orders.ts']) {
    if (!existsSync(join(ROOT, p))) continue
    expect(stripComments(read(p)), `'use cache' in ${p}`).not.toMatch(
      /['"]use cache['"]/
    )
  }
})

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
  'other pages keep today\'s behavior: no retention field on home or detail',
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

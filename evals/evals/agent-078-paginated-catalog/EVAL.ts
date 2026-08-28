/**
 * searchParams × the URL contract: per-page caching WITHOUT giving up ?page=N
 * (Next.js 16.4.0-canary.10, cacheComponents: true — verified 2026-08)
 *
 * Target semantics (Law v5: behavioral structure, no named API): under
 * cacheComponents a `?page=N` catalog keeps its query-string URL and still
 * gets per-page-value caching by awaiting `searchParams` inside the Suspense
 * hole, extracting the plain page value, and passing it as an argument into a
 * cached function/component — the argument becomes the cache key, the shell
 * stays prerendered (◐). An equivalent restructure that maps the query string
 * onto a path segment via `rewrites` (so the public ?page=N URLs still serve
 * that page's items) is deliberately ACCEPTED: the behavioral assertions carry
 * the discrimination, not the mechanism.
 *
 * FALSE BELIEF this eval targets: "searchParams makes a route dynamic
 * per-request by definition; to cache pagination you must restructure to path
 * segments (and change the public URLs)."
 *
 * The wrong path has ZERO local symptoms (spiked empirically on this canary):
 * awaiting searchParams and querying directly inside the Suspense hole builds
 * green, shows ◐ (Partial Prerender) in build output, emits zero warnings in
 * build and dev logs, and produces streamed HTML byte-equivalent to the cached
 * version modulo route names. The ONLY observable differential is the vendor
 * query log: one query per REQUEST instead of one per PAGE VALUE. Hence every
 * discriminating assertion here is a hit-count budget against
 * data/query-log.ndjson around a production build + `next start`.
 *
 * Also verified on this canary: `unstable_cacheLife` now throws a loud
 * deprecation ("was recently stabilized and should be imported as
 * `cacheLife`") during build/dev — solutions and oracles must import the
 * stable `cacheLife` from 'next/cache'.
 *
 * Why agents fail: they "know" searchParams === dynamic = uncacheable, so they
 * restructure the route to /catalog/[page] (breaking the printed affiliate
 * URLs — asserted via the ?page=N body contract), or they hand-roll a
 * module-scope memo (banned by source shape: multi-instance deployment), or
 * they leave the per-request query in place because nothing warns them.
 *
 * Caveat (accepted risk, consistent with all prior evals in this suite):
 * node_modules/next/dist/docs describes the extract-and-pass pattern; past
 * runs show agents do not grep bundled docs.
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4078
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const DATA_FILE = join(ROOT, 'data', 'products.json')
const LOG_FILE = join(ROOT, 'data', 'query-log.ndjson')

// Restored before the build: the agent's own dev runs may have touched it.
const PRISTINE_PRODUCTS =
  JSON.stringify(
    {
      '1': [
        { sku: 'TL-0101', name: 'Cast Iron Anvil', price: 189 },
        { sku: 'TL-0102', name: 'Forge Bellows', price: 74 },
        { sku: 'TL-0103', name: 'Ball-Peen Hammer', price: 32 },
        { sku: 'TL-0104', name: 'Bench Vise', price: 121 },
      ],
      '2': [
        { sku: 'GD-0201', name: 'Garden Trowel', price: 18 },
        { sku: 'GD-0202', name: 'Pruning Shears', price: 27 },
        { sku: 'GD-0203', name: 'Soaker Hose', price: 41 },
        { sku: 'GD-0204', name: 'Compost Tumbler', price: 139 },
      ],
      '3': [
        { sku: 'EL-0301', name: 'Soldering Iron', price: 45 },
        { sku: 'EL-0302', name: 'Digital Multimeter', price: 89 },
        { sku: 'EL-0303', name: 'Wire Stripper', price: 22 },
        { sku: 'EL-0304', name: 'Bench Power Supply', price: 210 },
      ],
    },
    null,
    2
  ) + '\n'

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

/** Removes comments AND empties string literal contents (quotes remain). */
function stripCommentsAndStrings(src: string): string {
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
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      i++
      out += quote + quote
    } else {
      out += c
      i++
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Behavioral setup: production build + start on PORT
// ---------------------------------------------------------------------------

let server: ChildProcess | undefined
let serverOutput = ''
let buildLineCount = 0

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

function logLines(): Array<{ query: string; page: unknown }> {
  if (!existsSync(LOG_FILE)) return []
  return readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { query: string; page: unknown }
      } catch {
        return null
      }
    })
    .filter((e): e is { query: string; page: unknown } => e !== null)
}

/** Billed queries for one page number since the server started. */
function runtimePageCount(page: number): number {
  return logLines()
    .slice(buildLineCount)
    .filter((e) => e.query === 'catalog.page' && Number(e.page) === page)
    .length
}

beforeAll(async () => {
  // Reset the data + bill: the agent's own dev/build runs will have appended
  // lines, and the build below may legitimately bill some queries itself
  // (e.g. a solution that prerenders known pages at build time).
  writeFileSync(DATA_FILE, PRISTINE_PRODUCTS)
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

  // Build-time queries (if any) are allowed; runtime budgets start here.
  buildLineCount = logLines().length

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
})

/** Full streamed body; the exact ?page=N URL must answer 200 directly. */
async function getPage(path: string): Promise<string> {
  const res = await fetch(BASE + path, { redirect: 'manual' })
  if (res.status !== 200) {
    throw new Error(
      `GET ${path} responded with ${res.status} — the printed affiliate URLs must keep serving that page's items directly`
    )
  }
  return res.text()
}

// ---------------------------------------------------------------------------
// Behavioral: the URL contract and the bill (tests run sequentially, in order)
// ---------------------------------------------------------------------------

test(
  '?page=1 keeps serving page-1 items, and 4 views bill at most one query',
  async () => {
    for (let i = 0; i < 4; i++) {
      const html = await getPage('/catalog?page=1')
      // The streamed response must contain the page's items (not only a
      // fallback spinner) and no other page's items.
      expect(html).toContain('TL-0101')
      expect(html).toContain('TL-0104')
      expect(html).not.toContain('GD-0201')
    }
    expect(
      runtimePageCount(1),
      `page-1 runtime query lines (bill):\n${serverOutput.slice(-2000)}`
    ).toBeLessThanOrEqual(1)
  },
  120_000
)

test(
  '?page=2 keeps serving page-2 items under its own cache key, and 3 views bill at most one query',
  async () => {
    for (let i = 0; i < 3; i++) {
      const html = await getPage('/catalog?page=2')
      expect(html).toContain('GD-0201')
      expect(html).toContain('GD-0204')
      // Wrong keying (page ignored / single shared entry) would leak page-1
      // items into the page-2 response.
      expect(html).not.toContain('TL-0101')
    }
    expect(runtimePageCount(2)).toBeLessThanOrEqual(1)
  },
  120_000
)

test('the vendor client is still what feeds the catalog (no data bypass)', () => {
  // Counted across build + runtime so that solutions which legitimately bill
  // known pages at build time still pass — but a solution that stops calling
  // lib/db.ts entirely (importing data/products.json directly, copying the
  // data into source, etc.) shows an empty bill and fails.
  const pages = new Set(
    logLines()
      .filter((e) => e.query === 'catalog.page')
      .map((e) => Number(e.page))
  )
  expect(pages.size).toBeGreaterThanOrEqual(2)
})

// ---------------------------------------------------------------------------
// Source-shape constraints
// ---------------------------------------------------------------------------

test('no bespoke in-process cache layers (multi-instance deployment)', () => {
  const offenders: string[] = []
  for (const f of sourceFiles()) {
    const src = read(f)
    const noComments = stripComments(src)
    const noStrings = stripCommentsAndStrings(src)
    if (/\bnew\s+(Map|WeakMap)\b/.test(noStrings)) {
      offenders.push(`${f}: module-level Map/WeakMap store`)
    }
    if (/(?:from\s*|require\s*\(\s*)['"][^'"]*lru[^'"]*['"]/i.test(noComments)) {
      offenders.push(`${f}: LRU cache import`)
    }
  }
  expect(offenders, offenders.join('\n')).toEqual([])
})

test("the framework serves the budgets (cached function/component, or a rewrite onto a cacheable segment)", () => {
  // Both mechanisms are accepted; the behavioral budgets above are what
  // actually discriminate. Public 'use cache' (incl. ': remote') — but NOT
  // 'use cache: private', which is per-visitor and cannot satisfy
  // "one query serves everyone".
  const usesCacheDirective = sourceFiles().some((f) => {
    const noComments = stripComments(read(f))
    return (
      /['"]use cache(?:: remote)?['"]/.test(noComments) ||
      /\bunstable_cache\b/.test(noComments)
    )
  })

  const configPath = [
    'next.config.ts',
    'next.config.mts',
    'next.config.mjs',
    'next.config.js',
    'next.config.cjs',
  ]
    .map((f) => join(ROOT, f))
    .find((p) => existsSync(p))
  const usesRewrites =
    !!configPath && /\brewrites\b/.test(stripComments(read(configPath)))

  expect(usesCacheDirective || usesRewrites).toBe(true)
})

test('cacheComponents stays enabled', () => {
  const configPath = [
    'next.config.ts',
    'next.config.mts',
    'next.config.mjs',
    'next.config.js',
    'next.config.cjs',
  ]
    .map((f) => join(ROOT, f))
    .find((p) => existsSync(p))
  expect(configPath).toBeTruthy()
  const config = read(configPath as string)
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/cacheComponents\s*:\s*false/)
})

test('lib/db.ts (the vendor-billed client) is unmodified', () => {
  const FROZEN_DB_TS = `
// lib/db.ts — Acme Product Data's metered query client. DO NOT MODIFY THIS FILE.
// It is owned by the vendor integration team. Every call is a billed query;
// one NDJSON line is appended to data/query-log.ndjson per call so the bill
// can be audited.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Product {
  sku: string
  name: string
  price: number
}

const DATA_FILE = join(process.cwd(), 'data', 'products.json')
const LOG_FILE = join(process.cwd(), 'data', 'query-log.ndjson')

function logBilledQuery(page: number) {
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ query: 'catalog.page', page }) + '\\n'
  )
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

export async function dbQueryCatalogPage(page: number): Promise<Product[]> {
  logBilledQuery(page)
  await simulateLatency()
  const pages = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Record<
    string,
    Product[]
  >
  return pages[String(page)] ?? []
}
`
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  expect(normalize(read(join(ROOT, 'lib', 'db.ts')))).toBe(
    normalize(FROZEN_DB_TS)
  )
})

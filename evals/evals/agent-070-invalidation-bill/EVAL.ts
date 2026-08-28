/**
 * The invalidation triangle: framework caching + read-your-writes + granularity
 * (Next.js 16.4.0-canary.10, cacheComponents: true — verified 2026-08)
 *
 * Target semantics, confirmed empirically against a production build+start:
 * - `updateTag(tag)` from 'next/cache' inside a Server Action expires the tag
 *   immediately: the action's own no-JS form-POST response re-renders fresh,
 *   AND the next visitor request (product page and catalog) is fresh. The same
 *   holds for `revalidateTag(tag, { expire: 0 })` and for expiring every
 *   affected route via `revalidatePath(...)`.
 * - `revalidateTag(tag, 'max')` — the first suggestion in the deprecation
 *   warning — is stale-while-revalidate: routes the action did NOT re-render
 *   itself (the catalog here, and the product page when it doesn't share the
 *   admin page's cache entry) serve STALE HTML on the very next request.
 *   Requirement "the very next catalog request shows the new data" fails
 *   deterministically on it (observed: stale catalog HTML + one background
 *   query).
 * - Single-arg `revalidateTag(tag)` logs: `"revalidateTag" without the second
 *   argument is now deprecated, add second argument of "max" or use
 *   "updateTag". See more info here:
 *   https://nextjs.org/docs/messages/revalidate-tag-single-arg` — and its TS
 *   signature requires the second argument on this canary. It still gives
 *   read-your-writes at runtime, so it would pass every behavioral assertion;
 *   it is DELIBERATELY BANNED by source shape as a deprecated API, so the only
 *   passing paths are updateTag / an expire-now profile / per-route path
 *   expiry.
 *
 * Why agents fail:
 * - They reach for `revalidateTag(tag)`, hit the deprecation warning/TS error,
 *   and follow its first suggestion (`'max'`) — the catalog then serves stale
 *   HTML right after a save.
 * - They use one global tag (or expire '/' by path), so editing one product
 *   re-queries the others (granularity budget fails).
 * - They hand-roll a module-scope Map/LRU cache, which meets the hit budgets
 *   in a single process but is banned (multi-instance deployment).
 *
 * All freshness and hit-budget assertions are behavioral against `next start`
 * on port 4070 with the query log truncated first; the save is exercised as a
 * progressive-enhancement (no-JS) multipart form POST replayed from the admin
 * page's own HTML.
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

const PORT = 4070
const BASE = `http://localhost:${PORT}`
const ROOT = process.cwd()
const DATA_FILE = join(ROOT, 'data', 'products.json')
const LOG_FILE = join(ROOT, 'data', 'query-log.ndjson')

const PRISTINE_PRODUCTS =
  JSON.stringify(
    [
      { slug: 'p1', name: 'Aurora Desk Lamp', price: 89 },
      { slug: 'p2', name: 'Baltic Bookshelf', price: 240 },
      { slug: 'p3', name: 'Cascade Kettle', price: 65 },
    ],
    null,
    2
  ) + '\n'

// ---------------------------------------------------------------------------
// Source scanning helpers
// ---------------------------------------------------------------------------

function sourceFiles(): string[] {
  const out: string[] = []
  const skipDirs = new Set(['node_modules', '.next', '.git', 'data'])
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

/**
 * Finds `revalidateTag(...)` calls whose argument list has no top-level comma,
 * i.e. deprecated single-argument calls, tolerant of multi-line formatting.
 * Operates on comment- and string-stripped source so commas inside strings or
 * mentions in comments don't confuse the scan.
 */
function findSingleArgRevalidateTagCalls(stripped: string): string[] {
  const bad: string[] = []
  const re = /\brevalidateTag\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped))) {
    let depth = 1
    let topLevelComma = false
    let i = m.index + m[0].length
    while (i < stripped.length && depth > 0) {
      const c = stripped[i]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') depth--
      else if (c === ',' && depth === 1) topLevelComma = true
      i++
    }
    if (!topLevelComma) {
      bad.push(stripped.slice(m.index, Math.min(i, m.index + 120)))
    }
  }
  return bad
}

// ---------------------------------------------------------------------------
// Behavioral setup: production build + start on PORT
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
  // Reset data files: the agent's own dev runs may have saved edits, and the
  // build below bakes product names into prerendered HTML.
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

// ---------------------------------------------------------------------------
// Query-log accounting (lib/db.ts writes one NDJSON line per billed query)
// ---------------------------------------------------------------------------

function countQueries(pred: (e: { query: string; slug: string | null }) => boolean): number {
  if (!existsSync(LOG_FILE)) return 0
  return readFileSync(LOG_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { query: string; slug: string | null }
      } catch {
        return null
      }
    })
    .filter((e): e is { query: string; slug: string | null } => e !== null)
    .filter(pred).length
}

const productCount = (slug: string) =>
  countQueries((e) => e.query === 'product' && e.slug === slug)
const catalogCount = () => countQueries((e) => e.query === 'all-products')

async function getPage(path: string): Promise<string> {
  const res = await fetch(BASE + path, { redirect: 'manual' })
  if (res.status !== 200) {
    throw new Error(`GET ${path} responded with ${res.status}`)
  }
  return res.text()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function parseInputs(html: string): Array<{ name: string; value: string }> {
  const inputs: Array<{ name: string; value: string }> = []
  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const nameM = /\bname="([^"]*)"/.exec(tag)
    if (!nameM) continue
    const valueM = /\bvalue="([^"]*)"/.exec(tag)
    inputs.push({
      name: decodeEntities(nameM[1]),
      value: valueM ? decodeEntities(valueM[1]) : '',
    })
  }
  return inputs
}

// Shared behavioral state (tests in this file run sequentially, in order).
let nonce = ''
let p2CountAtSave = 0

// ---------------------------------------------------------------------------
// Hit budgets (the exploded bill)
// ---------------------------------------------------------------------------

test('product page: repeat requests are served from at most one query', async () => {
  writeFileSync(LOG_FILE, '')
  for (let i = 0; i < 3; i++) {
    const html = await getPage('/products/p1')
    expect(html).toContain('Aurora Desk Lamp')
  }
  expect(productCount('p1')).toBeLessThanOrEqual(1)
})

test('catalog: repeat requests are served from at most one query', async () => {
  const before = catalogCount()
  const html = await getPage('/products')
  expect(html).toContain('Aurora Desk Lamp')
  expect(html).toContain('Baltic Bookshelf')
  await getPage('/products')
  expect(catalogCount() - before).toBeLessThanOrEqual(1)
})

test('admin editor: reads are billed against the same budget', async () => {
  const before = productCount('p1')
  const html = await getPage('/admin/products/p1')
  expect(html).toContain('Aurora Desk Lamp')
  await getPage('/admin/products/p1')
  expect(productCount('p1') - before).toBeLessThanOrEqual(1)
})

test('each product page is cached independently (warming p2)', async () => {
  const before = productCount('p2')
  const html = await getPage('/products/p2')
  expect(html).toContain('Baltic Bookshelf')
  await getPage('/products/p2')
  expect(productCount('p2') - before).toBeLessThanOrEqual(1)
})

// ---------------------------------------------------------------------------
// The save flow (progressive-enhancement form POST, no JS)
// ---------------------------------------------------------------------------

test('the save response itself shows the saved values (read-your-writes)', async () => {
  const adminHtml = await getPage('/admin/products/p1')
  const formBlock = (adminHtml.match(/<form\b[\s\S]*?<\/form>/gi) ?? []).find(
    (f) => /\bname="name"/.test(f)
  )
  expect(
    formBlock,
    'the admin page must render a form with an input named "name" (see PROMPT.md: internal tooling posts to that form)'
  ).toBeTruthy()

  const inputs = parseInputs(formBlock as string)
  nonce = 'Edited-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const form = new FormData()
  for (const inp of inputs) {
    form.set(inp.name, inp.name === 'name' ? nonce : inp.value)
  }

  p2CountAtSave = productCount('p2')

  const res = await fetch(BASE + '/admin/products/p1', {
    method: 'POST',
    body: form,
    redirect: 'follow',
  })
  expect(res.ok).toBe(true)
  const postHtml = await res.text()

  // The write itself must have happened...
  expect(readFileSync(DATA_FILE, 'utf8')).toContain(nonce)
  // ...and the response the editor screenshots must already show it. (The
  // submitted value is NOT echoed back into a stale render — verified: with
  // no invalidation the response contains the old name and no nonce at all.)
  expect(postHtml).toContain(nonce)
})

test('the very next visitor request for the product shows the new data', async () => {
  const html = await getPage('/products/p1')
  expect(html).toContain(nonce)
  expect(html).not.toContain('Aurora Desk Lamp')
})

test('saving p1 did not throw away cached data for p2', async () => {
  const html = await getPage('/products/p2')
  expect(html).toContain('Baltic Bookshelf')
  expect(productCount('p2') - p2CountAtSave).toBe(0)
})

test('the catalog shows the new data right after the save', async () => {
  const before = catalogCount()
  const html = await getPage('/products')
  expect(html).toContain(nonce)
  // Refreshing the catalog is allowed to cost a bounded number of queries...
  expect(catalogCount() - before).toBeLessThanOrEqual(2)
  // ...but must still not have re-queried unrelated products anywhere in the
  // whole save flow.
  expect(productCount('p2') - p2CountAtSave).toBe(0)
})

// ---------------------------------------------------------------------------
// Source-shape constraints
// ---------------------------------------------------------------------------

test('deprecated single-argument revalidateTag is not used', () => {
  const offenders: string[] = []
  for (const f of sourceFiles()) {
    const calls = findSingleArgRevalidateTagCalls(stripCommentsAndStrings(read(f)))
    for (const c of calls) {
      offenders.push(`${f}: ${c.replace(/\s+/g, ' ')}`)
    }
  }
  expect(offenders, offenders.join('\n')).toEqual([])
})

test('no bespoke in-process cache layers', () => {
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

test("the framework's cache is what serves the budgets", () => {
  const usesFrameworkCache = sourceFiles().some((f) => {
    const noComments = stripComments(read(f))
    return (
      /['"]use cache['"]/.test(noComments) ||
      /\bunstable_cache\b/.test(noComments)
    )
  })
  expect(usesFrameworkCache).toBe(true)
})

test('the save flow is still a server action (no new API endpoints)', () => {
  const files = sourceFiles()
  const hasUseServer = files.some((f) =>
    /['"]use server['"]/.test(stripComments(read(f)))
  )
  expect(hasUseServer).toBe(true)

  const routeHandlers = files.filter(
    (f) =>
      /(^|\/)app\//.test(f.slice(ROOT.length)) &&
      /^route\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f.split('/').pop() as string)
  )
  expect(routeHandlers, routeHandlers.join('\n')).toEqual([])
})

test('cacheComponents stays enabled', () => {
  const configPath = ['next.config.ts', 'next.config.mjs', 'next.config.js']
    .map((f) => join(ROOT, f))
    .find((p) => existsSync(p))
  expect(configPath).toBeTruthy()
  const config = read(configPath as string)
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/cacheComponents\s*:\s*false/)
})

test('lib/db.ts (the billing-instrumented client) is unmodified', () => {
  const FROZEN_DB_TS = `
// lib/db.ts — the metered data-source client. DO NOT MODIFY THIS FILE.
// Every call is billed. One NDJSON line is appended to data/query-log.ndjson
// per query so the bill can be audited.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Product {
  slug: string
  name: string
  price: number
}

const DATA_FILE = join(process.cwd(), 'data', 'products.json')
const LOG_FILE = join(process.cwd(), 'data', 'query-log.ndjson')

function logQuery(query: string, slug: string | null) {
  appendFileSync(LOG_FILE, JSON.stringify({ query, slug }) + '\\n')
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

export async function dbQueryAllProducts(): Promise<Product[]> {
  logQuery('all-products', null)
  await simulateLatency()
  return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Product[]
}

export async function dbQueryProduct(slug: string): Promise<Product | null> {
  logQuery('product', slug)
  await simulateLatency()
  const products = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Product[]
  return products.find((p) => p.slug === slug) ?? null
}
`
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
  expect(normalize(read(join(ROOT, 'lib', 'db.ts')))).toBe(
    normalize(FROZEN_DB_TS)
  )
})

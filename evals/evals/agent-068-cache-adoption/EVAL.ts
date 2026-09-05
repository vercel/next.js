/**
 * Cache Components adoption: whole-app migration off v14/15 caching idioms
 *
 * Target (composite, verified on next 16.4.0-canary.10): under
 * `cacheComponents: true` (stable v16, 2025-10) the framework's own build
 * errors funnel agents into silent failures. The loud errors are (1) removed
 * segment configs — `export const revalidate` / `dynamic` are hard build
 * errors — and (2) the blocking-prerender-dynamic error for uncached IO or
 * cookies outside <Suspense>, whose own text offers three hatches:
 * [stream] Suspense fallback, [cache] "use cache", [block]
 * `export const instant = false`. The silent traps (all verified build-green
 * on this canary):
 *   1. `export const instant = false` — kills the static shell: index.html
 *      becomes a 0-byte file, prerender-manifest entry flips to
 *      { compute: 'blocking', response: 'empty', htmlSize: 0 }.
 *   2. Hoisting one giant <Suspense> (e.g. around {children} in the root
 *      layout) with nothing cached — every page prerenders as a ~1.5KB
 *      nav+spinner shell with no content, and every request re-hits the
 *      data layer.
 *   3. Keeping `unstable_cache` — NOT a build error on this canary; it even
 *      still caches (page prerenders static, repeat requests take 0 db
 *      hits). Its ban here is the migration-completeness requirement stated
 *      in the prompt ("nothing should still be caching through the old
 *      ways"), not a correctness assert.
 *   4. Hoisting the cookie read and passing the user id into a PUBLIC
 *      'use cache' — no visible crossover (the id is in the cache key), but
 *      per-user data lands in shared cache storage: verified 2 requests for
 *      the same user → 1 data-layer hit, entry lives in the shared handler.
 *      The intended fix is 'use cache: private' (finalized mid-2026; works
 *      on this canary, reads cookies inside the private scope, and does NOT
 *      dedupe across requests) or plain dynamic-in-Suspense. Detection is
 *      layered: source ban (session/cookie-reading files must not carry a
 *      public 'use cache') plus a behavioral dedupe probe (2 requests for
 *      the same user must produce >= 2 data-layer hits).
 *
 * Behavioral asserts carry the discrimination; source asserts only pin the
 * flag, the bans, and the frozen data-layer file.
 */

import { test, expect, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const PORT = 4068
const BASE = 'http://localhost:' + PORT
const LOG = join(process.cwd(), 'data', 'query-log.ndjson')

let server: ChildProcess | undefined
let serverErr = ''
let buildLog = ''

function cleanEnv(): NodeJS.ProcessEnv {
  // vitest sets NODE_ENV=test, which breaks `next build` / `next start`.
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
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

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(30_000),
  })
  return { status: res.status, body: await res.text() }
}

beforeAll(async () => {
  if (await portAnswers()) {
    throw new Error(
      'port ' + PORT + ' already answers before `next start` — stale server leaked from a previous run'
    )
  }
  rmSync(join(process.cwd(), '.next'), { recursive: true, force: true })
  writeFileSync(LOG, '')
  execSync('node node_modules/next/dist/bin/next build', {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 600_000,
  })
  // What the build itself asked of the data layer (cache fills, SSG params).
  buildLog = readFileSync(LOG, 'utf-8')
  server = spawn(
    'node',
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  )
  server.stdout?.on('data', () => {})
  server.stderr?.on('data', (d: Buffer) => {
    serverErr += d.toString()
  })
  const deadline = Date.now() + 90_000
  let ready = false
  while (Date.now() < deadline) {
    if (await portAnswers()) {
      ready = true
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!ready) {
    throw new Error('next start never became ready on ' + PORT + '\n' + serverErr)
  }
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      // Detached process group: kill the whole group so the real next-server
      // (not just a wrapper) dies with us.
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      try {
        server.kill('SIGKILL')
      } catch {}
    }
  }
})

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function sourceFiles(...dirs: string[]): string[] {
  const out: string[] = []
  for (const dir of dirs) {
    const root = join(process.cwd(), dir)
    if (!existsSync(root)) continue
    for (const d of readdirSync(root, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!d.isFile()) continue
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(d.name)) continue
      const p = join((d as any).parentPath ?? (d as any).path, d.name)
      if (p.includes('node_modules') || p.includes('.next')) continue
      out.push(p)
    }
  }
  return out
}

function allFilesUnder(rel: string): string[] {
  const root = join(process.cwd(), rel)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join((d as any).parentPath ?? (d as any).path, d.name))
}

function readConfig(): string {
  for (const f of [
    'next.config.ts',
    'next.config.mts',
    'next.config.mjs',
    'next.config.js',
    'next.config.cjs',
  ]) {
    const p = join(process.cwd(), f)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  return ''
}

function html(name: string): string {
  const p = join(process.cwd(), '.next', 'server', 'app', name)
  return existsSync(p) ? readFileSync(p, 'utf-8') : ''
}

function countLines(logContent: string, needle: string): number {
  return logContent.split('\n').filter((l) => l.includes(needle)).length
}

// Matches the public directive only; 'use cache: private' is a different
// string literal and intentionally does not match.
const PUBLIC_USE_CACHE = /['"]use cache['"]/

const FROZEN_DB = String.raw`// lib/db.ts — owned by the data team. Do not modify this file.
//
// Thin typed access layer over the JSON files in data/. Every query appends
// one NDJSON line to data/query-log.ndjson so the data team can audit load.

import { readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export type Product = {
  slug: string
  name: string
  price: number
  description: string
}

export type User = {
  id: string
  name: string
  billingEmail: string
}

export type Promo = {
  headline: string
  code: string
}

const DATA_DIR = join(process.cwd(), 'data')

function pause(): Promise<void> {
  // Simulates stable query latency.
  return new Promise((resolve) => setTimeout(resolve, 50))
}

async function logQuery(query: string): Promise<void> {
  // performance.now() is monotonic and safe to read during prerendering.
  const line = JSON.stringify({ query, t: performance.now() }) + '\n'
  await appendFile(join(DATA_DIR, 'query-log.ndjson'), line, 'utf8')
}

async function readJson(file: string): Promise<unknown> {
  const raw = await readFile(join(DATA_DIR, file), 'utf8')
  return JSON.parse(raw)
}

export async function dbListProducts(): Promise<Product[]> {
  await logQuery('products.list')
  await pause()
  return (await readJson('products.json')) as Product[]
}

export async function dbGetProduct(slug: string): Promise<Product | null> {
  await logQuery('products.get:' + slug)
  await pause()
  const products = (await readJson('products.json')) as Product[]
  return products.find((p) => p.slug === slug) ?? null
}

export async function dbGetPromo(): Promise<Promo> {
  await logQuery('promo.current')
  await pause()
  return (await readJson('promo.json')) as Promo
}

export async function dbGetUser(userId: string): Promise<User | null> {
  await logQuery('users.get:' + userId)
  await pause()
  const users = (await readJson('users.json')) as User[]
  return users.find((u) => u.id === userId) ?? null
}
`

// ---------------------------------------------------------------------------
// source: the flag, the bans, the frozen file
// ---------------------------------------------------------------------------

test('cacheComponents is enabled in the config', () => {
  expect(readConfig()).toMatch(/cacheComponents\s*:\s*true/)
})

test('the legacy cache helper is fully migrated away', () => {
  for (const f of sourceFiles('app', 'lib')) {
    expect(stripComments(readFileSync(f, 'utf-8')), f).not.toMatch(
      /\bunstable_cache\b/
    )
  }
})

test('no route opts out of its instant shell', () => {
  for (const f of sourceFiles('app')) {
    const src = stripComments(readFileSync(f, 'utf-8'))
    expect(src, f).not.toMatch(/export\s+const\s+instant\b/)
    expect(src, f).not.toMatch(/\binstant\s*:\s*(false|0)\b/)
  }
})

test('lib/db.ts is byte-identical (it belongs to the data team)', () => {
  expect(read('lib/db.ts')).toBe(FROZEN_DB)
})

test('an explicit cache lifetime is configured (5-minute staleness bound)', () => {
  const inSources = sourceFiles('app', 'lib').some((f) =>
    /\bcacheLife\b/.test(stripComments(readFileSync(f, 'utf-8')))
  )
  const inConfig = /\bcacheLife\s*:/.test(readConfig())
  expect(inSources || inConfig).toBe(true)
})

test('files that read the session/cookies never use the public shared cache', () => {
  for (const f of sourceFiles('app', 'lib')) {
    const src = stripComments(readFileSync(f, 'utf-8'))
    const readsPrivateInput =
      /from\s+['"]next\/headers['"]/.test(src) ||
      /from\s+['"][^'"]*\bsession['"]/.test(src)
    if (readsPrivateInput) {
      expect(
        src,
        f + ' reads per-user input and must not carry a public "use cache"'
      ).not.toMatch(PUBLIC_USE_CACHE)
    }
  }
})

// ---------------------------------------------------------------------------
// artifacts: the prebuilt frame is real, and contains no per-user data
// ---------------------------------------------------------------------------

test('home prebuilt HTML contains the real frame and promo content', () => {
  const h = html('index.html')
  expect(h).toContain('Acme Outfitters') // site nav / brand
  expect(h).toContain('Welcome to Acme Outfitters') // page heading
  expect(h).toContain('Autumn Trail Sale') // promo content
})

test('products prebuilt HTML contains the real frame and catalog content', () => {
  const h = html('products.html')
  expect(h).toContain('Acme Outfitters')
  expect(h).toContain('Full Catalog')
  expect(h).toContain('Ridgeline Anorak')
})

test('home and products are not blocking routes (killed-shell fingerprint)', () => {
  const manifest = JSON.parse(read('.next/prerender-manifest.json'))
  for (const route of ['/', '/products']) {
    const entry = manifest.routes[route]
    expect(entry, route + ' missing from prerender manifest').toBeDefined()
    // `response: 'empty'` + `compute: 'blocking'` is the artifact fingerprint
    // of `export const instant = false` on this canary (0-byte document).
    expect(entry.response, route).not.toBe('empty')
  }
})

test('no per-user data in any build output', () => {
  for (const f of allFilesUnder('.next/server')) {
    const content = readFileSync(f, 'utf-8')
    expect(content, f).not.toContain('billing-alice@example.test')
    expect(content, f).not.toContain('billing-bob@example.test')
  }
  for (const name of ['index.html', 'products.html', 'account.html', 'cart.html']) {
    expect(html(name), name).not.toContain('cart-item-')
  }
})

// ---------------------------------------------------------------------------
// behavior: caching budgets and per-user privacy under `next start`
// ---------------------------------------------------------------------------

test('the build filled the caches through the frozen data layer', () => {
  // Guards against baking data/*.json into the bundle instead of querying:
  // a real adoption fills its caches via lib/db.ts during the build.
  expect(buildLog).toContain('products.list')
  expect(buildLog).toContain('promo.current')
})

test('repeat catalog/promo requests are served from cache (one query max)', async () => {
  writeFileSync(LOG, '')
  const p1 = await get('/products')
  expect(p1.status).toBe(200)
  expect(p1.body).toContain('Full Catalog')
  expect(p1.body).toContain('Ridgeline Anorak')
  await get('/products')
  await get('/products')
  const h1 = await get('/')
  expect(h1.status).toBe(200)
  expect(h1.body).toContain('Autumn Trail Sale')
  await get('/')
  const log = readFileSync(LOG, 'utf-8')
  // Budget allows one background revalidation, never per-request re-reads.
  expect(
    countLines(log, 'products.list'),
    'catalog queries across 3 requests'
  ).toBeLessThanOrEqual(1)
  expect(
    countLines(log, 'promo.current'),
    'promo queries across 2 requests'
  ).toBeLessThanOrEqual(1)
})

test('account responses are strictly per-user', async () => {
  const alice = await get('/account', 'session=alice')
  expect(alice.status).toBe(200)
  expect(alice.body).toContain('billing-alice@example.test')
  expect(alice.body).not.toContain('billing-bob@example.test')
  const bob = await get('/account', 'session=bob')
  expect(bob.status).toBe(200)
  expect(bob.body).toContain('billing-bob@example.test')
  expect(bob.body).not.toContain('billing-alice@example.test')
})

test('no crossover under concurrent alternating sessions', async () => {
  const users = ['alice', 'bob', 'alice', 'bob', 'alice', 'bob']
  const responses = await Promise.all(
    users.map((u) => get('/account', 'session=' + u))
  )
  responses.forEach((res, i) => {
    const own = 'billing-' + users[i] + '@example.test'
    const other =
      'billing-' + (users[i] === 'alice' ? 'bob' : 'alice') + '@example.test'
    expect(res.status).toBe(200)
    expect(res.body, 'request ' + i + ' (' + users[i] + ')').toContain(own)
    expect(res.body, 'request ' + i + ' (' + users[i] + ')').not.toContain(
      other
    )
  })
})

test('per-user data is never served from shared cache storage', async () => {
  // A public 'use cache' keyed by user id shows no crossover, but it parks
  // per-user data in the shared store: the repeat request is then answered
  // without consulting the data layer. Verified on this canary: correct
  // adoptions (dynamic-in-Suspense or 'use cache: private') re-query on
  // every request.
  writeFileSync(LOG, '')
  await get('/account', 'session=alice')
  await get('/account', 'session=alice')
  const log = readFileSync(LOG, 'utf-8')
  expect(countLines(log, 'users.get:alice')).toBeGreaterThanOrEqual(2)
})

test('cart responses are strictly per-user', async () => {
  const c1 = await get('/cart', 'cart=ridgeline-anorak,basecamp-flask')
  expect(c1.status).toBe(200)
  expect(c1.body).toContain('ridgeline-anorak')
  expect(c1.body).not.toContain('cloudrest-quilt')
  const c2 = await get('/cart', 'cart=cloudrest-quilt')
  expect(c2.status).toBe(200)
  expect(c2.body).toContain('cloudrest-quilt')
  expect(c2.body).not.toContain('ridgeline-anorak')
})

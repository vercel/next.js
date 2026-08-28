/**
 * Cross-account data-leak hunt (Next 16.4, cacheComponents, prod server)
 *
 * The fixture seeds three independent leak species that all build, typecheck
 * and render correctly in single-user testing:
 *
 *  1. lib/request-context.ts keeps the signed-in user in a module-scope
 *     `let`. Server-component modules are shared across concurrent requests
 *     in one Node process, so with a ~50ms awaited gap between the write
 *     (loadSession) and the deep-component read, an interleaved request from
 *     another account deterministically overwrites it: request A renders
 *     request B's identity and billing email.
 *  2. lib/insights.ts memoizes the org-wide aggregate in a module `Map`
 *     keyed by dashboard section only, while the value is computed from the
 *     *current user's* company — the first org's numbers are served to every
 *     later account (deterministic on the 2nd request).
 *  3. lib/account.ts caches a per-user billing summary with a PUBLIC
 *     'use cache' taking the session as an argument. It renders correctly
 *     per user (keys include the args), so it is invisible behaviorally —
 *     but it persists session-derived data in cache storage shared across
 *     users, which the prompt's security policy forbids. Verified on this
 *     canary: runtime public-cache entries are process-shared;
 *     'use cache: private' entries are per-request (they do NOT persist
 *     across requests in prod), so the freshness budget below is applied
 *     ONLY to the org-wide aggregate, never to per-user reads.
 *
 * Why agents fail (2026-08): 2025-trained agents find the Map memo, usually
 * miss the module-scope request context (it reads as ordinary code and never
 * leaks single-user), miss the public-cache policy hole (it renders
 * correctly), or overcorrect by deleting caching entirely — which trips the
 * aggregate hit budget.
 *
 * Accepted fixes (any combination):
 *  - request context → React cache() per-request store, AsyncLocalStorage,
 *    or prop threading (anything without module-scope mutable state);
 *  - insights → framework-cached aggregate keyed by company in a file free
 *    of session coupling (public 'use cache', optionally cacheLife);
 *  - account summary → 'use cache: private' or plain uncached per-request
 *    reads.
 *
 * Assertion notes:
 *  - "module top level" is approximated as column-0 `let`/`var` (function
 *    bodies are indented; comments are stripped before all source scans).
 *  - the public-cache regex /['"]use cache['"]/ intentionally does not match
 *    'use cache: private'.
 *  - db-query.log is written by the frozen lib/db.ts (one line per query);
 *    the budget tolerates a warm cache (<=1 aggregate query per 3 views).
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

const PORT = 4069
const BASE = 'http://localhost:' + PORT
const LOG = join(process.cwd(), 'db-query.log')
const NEXT_BIN = join('node_modules', 'next', 'dist', 'bin', 'next')

const ALICE = {
  cookie: 'session=alice@acme',
  own: 'alice',
  foreign: ['bob', 'globex', 'billing-bob@globex.test'],
}
const BOB = {
  cookie: 'session=bob@globex',
  own: 'bob',
  foreign: ['alice', 'acme', 'billing-alice@acme.test'],
}

let server: ChildProcess | undefined

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function tryGet(route: string): Promise<string | null> {
  try {
    const res = await fetch(BASE + route, { redirect: 'manual' })
    return await res.text()
  } catch {
    return null
  }
}

async function get(route: string, cookie: string): Promise<string> {
  const res = await fetch(BASE + route, { headers: { cookie } })
  expect(res.status).toBe(200)
  return res.text()
}

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8')
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
}

function sourceFiles(): string[] {
  const files: string[] = []
  for (const dir of ['lib', 'app']) {
    const root = join(process.cwd(), dir)
    if (!existsSync(root)) continue
    for (const d of readdirSync(root, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!d.isFile() || !/\.(ts|tsx)$/.test(d.name)) continue
      const parent = d.parentPath ?? (d as unknown as { path: string }).path
      files.push(join(parent, d.name))
    }
  }
  return files
}

function queryLines(pattern: string): string[] {
  const log = existsSync(LOG) ? readFileSync(LOG, 'utf8') : ''
  return log.split('\n').filter((l) => l.includes(pattern))
}

beforeAll(async () => {
  if ((await tryGet('/')) !== null) {
    throw new Error(
      'port ' + PORT + ' already answers — refusing to test a stale server'
    )
  }
  rmSync(join(process.cwd(), '.next'), { recursive: true, force: true })
  execSync(process.execPath + ' ' + NEXT_BIN + ' build', {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 600_000,
  })
  server = spawn(
    process.execPath,
    [NEXT_BIN, 'start', '-p', String(PORT)],
    { env: cleanEnv(), stdio: 'pipe', detached: true }
  )
  const deadline = Date.now() + 60_000
  for (;;) {
    if ((await tryGet('/')) !== null) break
    if (Date.now() > deadline) {
      throw new Error('next start did not become ready on port ' + PORT)
    }
    await sleep(500)
  }
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {}
    try {
      server.kill('SIGKILL')
    } catch {}
  }
})

// ---------------------------------------------------------------------------
// Frozen data layer
// ---------------------------------------------------------------------------

const DB_SOURCE = `// lib/db.ts — owned by the data team. Do not modify.
//
// Reads the seeded datasets under data/ and appends one line per query to
// db-query.log in the app root so capacity planning can audit read volume.

import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OrgAggregate {
  company: string
  events30d: number
  activeSeats: number
}

export interface BillingRecord {
  userId: string
  plan: string
  billingEmail: string
}

const LOG_PATH = join(process.cwd(), 'db-query.log')

function logQuery(line: string) {
  try {
    appendFileSync(LOG_PATH, line + '\\n')
  } catch {
    // Logging must never break a request.
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readDataset<T>(name: string): Promise<T> {
  const raw = await readFile(join(process.cwd(), 'data', name), 'utf8')
  return JSON.parse(raw) as T
}

export async function getOrgAggregate(company: string): Promise<OrgAggregate> {
  logQuery('query=getOrgAggregate company=' + company)
  // Stand-in for a full warehouse scan; the real one is far slower.
  await delay(80)
  const orgs =
    await readDataset<Record<string, { events30d: number; activeSeats: number }>>(
      'orgs.json'
    )
  const row = orgs[company] ?? { events30d: 0, activeSeats: 0 }
  return { company, events30d: row.events30d, activeSeats: row.activeSeats }
}

export async function getUserBilling(userId: string): Promise<BillingRecord> {
  logQuery('query=getUserBilling userId=' + userId)
  await delay(30)
  const users =
    await readDataset<Record<string, { plan: string; billingEmail: string }>>(
      'users.json'
    )
  const row = users[userId] ?? { plan: 'free', billingEmail: 'unknown@example.test' }
  return { userId, plan: row.plan, billingEmail: row.billingEmail }
}
`

test('lib/db.ts is byte-identical to the data-team version', () => {
  expect(read('lib/db.ts')).toBe(DB_SOURCE)
})

// ---------------------------------------------------------------------------
// Behavioral: cross-account isolation
// ---------------------------------------------------------------------------

test('a later account never sees an earlier org aggregate', async () => {
  // These are the first page requests this fresh server receives.
  const a = await get('/overview', ALICE.cookie)
  expect(a).toContain('alice')
  expect(a).toContain('acme')
  expect(a).not.toContain('globex')
  const b = await get('/overview', BOB.cookie)
  expect(b).toContain('bob')
  expect(b).toContain('globex')
  expect(b).not.toContain('acme')
  // The numbers must come from the data layer, not be inlined in app code.
  expect(queryLines('getOrgAggregate').length).toBeGreaterThanOrEqual(1)
}, 60_000)

test('interleaved concurrent requests never leak another account', async () => {
  for (const route of ['/overview', '/billing']) {
    for (let i = 0; i < 10; i++) {
      const first = get(route, ALICE.cookie)
      await sleep(20)
      const second = get(route, BOB.cookie)
      const [a, b] = await Promise.all([first, second])
      const at = route + ' pair ' + i
      expect(a, at).toContain(ALICE.own)
      expect(b, at).toContain(BOB.own)
      for (const marker of ALICE.foreign) {
        expect(a, at + ' alice response').not.toContain(marker)
      }
      for (const marker of BOB.foreign) {
        expect(b, at + ' bob response').not.toContain(marker)
      }
    }
  }
}, 180_000)

// ---------------------------------------------------------------------------
// Behavioral: freshness budget (org aggregate only — per-user data is exempt)
// ---------------------------------------------------------------------------

test('repeat same-user views reuse the expensive org aggregate', async () => {
  writeFileSync(LOG, '')
  for (let i = 0; i < 3; i++) {
    await get('/overview', ALICE.cookie)
  }
  // At most one warehouse scan per few minutes; a warm cache (0 scans) is
  // fine. Per-request recomputation (3 scans) is a failed requirement.
  expect(queryLines('getOrgAggregate').length).toBeLessThanOrEqual(1)
}, 60_000)

test('billing data is still served per user through the data layer', async () => {
  writeFileSync(LOG, '')
  const a = await get('/billing', ALICE.cookie)
  expect(a).toContain('billing-alice@acme.test')
  expect(queryLines('getUserBilling').length).toBeGreaterThanOrEqual(1)
}, 60_000)

// ---------------------------------------------------------------------------
// Source: leak mechanisms must be gone (comments are stripped first)
// ---------------------------------------------------------------------------

test('cacheComponents stays enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

test('no module-scope mutable bindings in app code', () => {
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    expect(src, f).not.toMatch(/^(?:export\s+)?(?:let|var)\s/m)
  }
})

test('no hand-rolled Map/WeakMap caches in app code', () => {
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    expect(src, f).not.toMatch(/\bnew\s+(Map|WeakMap)\b/)
  }
})

test('no public "use cache" in session-coupled files', () => {
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    if (!/['"]use cache['"]/.test(src)) continue
    // A file that persists to the shared public cache must not be coupled to
    // the signed-in session or to per-user billing reads.
    expect(src, f).not.toMatch(
      /from\s*['"][^'"]*(session|request-context)(\.[jt]sx?)?['"]/
    )
    expect(src, f).not.toMatch(
      /import\s*(?:type\s*)?\{[^}]*\bgetUserBilling\b[^}]*\}\s*from|\bgetUserBilling\s*\(/
    )
  }
})

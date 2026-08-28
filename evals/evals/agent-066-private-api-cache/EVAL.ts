/**
 * Private vs public 'use cache' in a route handler (cacheComponents, v16.4)
 *
 * 'use cache: private' is allowed in route handlers and may read cookies()
 * inside (route-handler semantics pinned 2026-08-14, commit 40188b5e39). But
 * in production a private entry is scoped to the request that created it: it
 * dedupes calls within that request and is NEVER persisted across requests —
 * every new request recomputes, and cacheLife({ revalidate }) on the private
 * helper is silently inert. In `next dev`, however, private entries ARE
 * persisted across requests (forced revalidate: 0, served stale with a
 * background refresh; 2026-06-11, commit 5b0aa04b10) — so the endpoint looks
 * cached in dev and uncached in prod, which is exactly the symptom in
 * PROMPT.md. The fix is to hoist the cookie read into the GET handler and
 * pass the uid as an argument to a PUBLIC 'use cache' helper, which does
 * persist across requests in prod, keyed by its arguments.
 *
 * Agents fail by believing 'private' means "per-user persistent cache": they
 * keep the private directive and tweak cacheLife (inert in prod), or reach
 * for a module-scope Map / globalThis stash (banned below by syntax shape —
 * PROMPT.md rules out in-process caches because the app runs multiple
 * instances, and a single-instance test server would otherwise let those
 * pass behaviorally).
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4066
const BASE = `http://localhost:${PORT}`
let server: ChildProcess | undefined

function cleanEnv(): NodeJS.ProcessEnv {
  // vitest sets NODE_ENV=test, which breaks `next build`/`next start`.
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

function logEntries(user: string): Array<{ user: string; stamp: unknown }> {
  const p = join(process.cwd(), 'data', 'compute-log.ndjson')
  if (!existsSync(p)) return []
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.user === user)
}

async function getRecs(uid: string): Promise<{ items: unknown; stamp: unknown }> {
  const res = await fetch(`${BASE}/api/recommendations`, {
    headers: { cookie: `uid=${uid}` },
  })
  expect(res.status).toBe(200)
  return await res.json()
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function sourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join((d as any).parentPath ?? (d as any).path, d.name))
    .filter((p) => !/node_modules|\.next/.test(p))
}

const NEXT_BIN = join('node_modules', 'next', 'dist', 'bin', 'next')

beforeAll(async () => {
  rmSync('.next', { recursive: true, force: true })
  rmSync(join('data', 'compute-log.ndjson'), { force: true })

  // Fail fast if something is already answering on our port — otherwise the
  // fetches below would silently test a stale server from another run.
  try {
    await fetch(`${BASE}/api/recommendations`)
    throw new Error(`port ${PORT} is already in use before next start`)
  } catch (err) {
    if (err instanceof Error && /already in use/.test(err.message)) throw err
  }

  execSync(`node ${NEXT_BIN} build`, {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 600_000,
  })
  // Spawn the next bin directly (an npx wrapper would orphan the real server
  // when killed) in its own process group so afterAll can kill the whole tree.
  server = spawn('node', [NEXT_BIN, 'start', '-p', String(PORT)], {
    env: cleanEnv(),
    stdio: 'pipe',
    detached: true,
  })
  // Poll readiness with a throwaway uid so warmup requests never pollute the
  // alice/bob compute-log counts asserted below.
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/recommendations`, {
        headers: { cookie: 'uid=warmup' },
      })
      if (res.status === 200) break
    } catch {}
    if (Date.now() > deadline) {
      throw new Error(`next start did not become ready on port ${PORT}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
  }
})

let aliceFirst: { items: unknown; stamp: unknown }

test('prod: repeat requests for the same user are served by one computation', async () => {
  aliceFirst = await getRecs('alice')
  const second = await getRecs('alice')
  expect(second.stamp).toBe(aliceFirst.stamp)
  expect(logEntries('alice')).toHaveLength(1)
})

test('prod: a different user gets an independently computed list of their own', async () => {
  const bob = await getRecs('bob')
  expect(bob.stamp).not.toBe(aliceFirst.stamp)
  expect(JSON.stringify(bob.items)).not.toBe(JSON.stringify(aliceFirst.items))
  expect(logEntries('bob')).toHaveLength(1)
  // Bob's request must not have evicted or recomputed alice's entry.
  expect(logEntries('alice')).toHaveLength(1)
})

test('prod: the first user is still served the original entry afterwards', async () => {
  const third = await getRecs('alice')
  expect(third.stamp).toBe(aliceFirst.stamp)
  expect(logEntries('alice')).toHaveLength(1)
})

test('no hand-rolled in-process caches (multi-instance deployment)', () => {
  for (const f of [...sourceFiles('app'), ...sourceFiles('lib')]) {
    // Comments are stripped first so an explanatory remark that mentions
    // `new Map()` or `globalThis.` doesn't falsely reject a correct solution.
    const src = stripComments(readFileSync(f, 'utf-8'))
    expect(src, f).not.toMatch(/\bnew\s+(Map|WeakMap)\s*\(/)
    expect(src, f).not.toMatch(/\bglobalThis\s*[.[]/)
  }
})

test('the endpoint is fed by framework caching', () => {
  const files = [...sourceFiles('app'), ...sourceFiles('lib')]
  // Accept every directive variant: plain, ': private', and ': remote'
  // (self-hosted, 'remote' aliases the default handler, so it behaves like
  // the plain form — a run showed an agent legitimately choosing it).
  const hasDirective = files.some((f) =>
    /['"]use cache(?:: (?:private|remote))?['"]/.test(readFileSync(f, 'utf-8'))
  )
  // unstable_cache is a legacy but still-functional framework cache; accept it
  // as an alternate path (behavioral tests above prove whichever mechanism is
  // used actually persists across requests).
  const hasUnstableCache = files.some((f) =>
    /import\s*(?:\{[^}]*\bunstable_cache\b[^}]*\}|[\w$]+\s*,\s*\{[^}]*\bunstable_cache\b[^}]*\})\s*from\s*['"]next\/cache['"]/.test(
      readFileSync(f, 'utf-8')
    )
  )
  expect(hasDirective || hasUnstableCache).toBe(true)
})

test('the route handler still exists and exports GET', () => {
  const p = join(process.cwd(), 'app', 'api', 'recommendations', 'route.ts')
  expect(existsSync(p)).toBe(true)
  const src = readFileSync(p, 'utf-8')
  expect(src).toMatch(
    /export\s+(?:async\s+)?function\s+GET\b|export\s+const\s+GET\s*[:=]/
  )
})

test('config keeps cacheComponents enabled', () => {
  expect(
    readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')
  ).toMatch(/cacheComponents\s*:\s*true/)
})

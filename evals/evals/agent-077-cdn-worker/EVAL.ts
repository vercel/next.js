/**
 * Cross-origin CDN assetPrefix breaks module Workers; the fix is
 * `experimental.turbopackWorkerAssetPrefix: ''` (agent-077-cdn-worker)
 *
 * With `assetPrefix` pointing at a CDN origin, Turbopack's worker bootstrap
 * derives the `new Worker(new URL('./x.ts', import.meta.url), { type:
 * 'module' })` entrypoint URL from the runtime asset base — the CDN origin —
 * and browsers refuse cross-origin Worker construction with a generic
 * SecurityError DOMException that names no Next.js config. Both builds exit
 * 0 with zero warnings. The fix, `experimental.turbopackWorkerAssetPrefix:
 * ''` (668094edce, 2026-04-29, config-shared.ts — "Mirrors webpack's
 * `output.workerPublicPath`"), pins the worker entrypoint and its chunks to
 * same-origin `/_next/...` while everything else stays CDN-prefixed.
 *
 * A 2025-trained agent believes Next/Turbopack exposes no workerPublicPath
 * equivalent, so with a CDN assetPrefix it reaches for the fetch+Blob shim,
 * hosts the worker in public/, or declares the combination impossible.
 *
 * Artifact fingerprint (verified twice on 16.4.0-canary.10; chunk content is
 * byte-stable across rebuilds): the worker factory chunk — the one client
 * chunk containing the quoted 'SharedWorker' literal, which is also the only
 * chunk referencing `static/chunks/turbopack-worker-` — assigns the worker
 * URL base as the quoted literal "/_next/" when the flag is set, and as the
 * runtime base property (`t.b`, CDN-derived; no quoted "/_next/" literal
 * anywhere in that chunk) when it is not. An unrelated framework chunk
 * contains a quoted "/_next/" in both builds, so the check MUST be scoped to
 * factory chunks. The blob-shim rewrite removes the `new Worker(new URL(`
 * form, so Turbopack emits no `turbopack-worker-*.js` chunk group and no
 * factory chunk at all (the worker survives only as a raw .ts media asset).
 */

import { test, expect, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'

const PORT = 4077
const CDN_ORIGIN = 'https://cdn.acme-static.example'
const CHUNKS_DIR = join(process.cwd(), '.next', 'static', 'chunks')

let server: ChildProcess | undefined

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  // vitest sets NODE_ENV=test, which breaks next build/start
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join((d.parentPath ?? (d as any).path) as string, d.name))
}

/** All fixture-owned .ts/.tsx sources (excludes deps, build output, EVAL). */
function sourceFiles(): { path: string; text: string }[] {
  const skip = /\/(node_modules|\.next|\.git)\//
  return walkFiles(process.cwd())
    .filter((p) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(p))
    .filter((p) => !skip.test(p))
    .filter((p) => {
      const base = basename(p)
      return (
        !base.startsWith('EVAL') &&
        !/\.test\.[cm]?[jt]sx?$/.test(base) &&
        base !== 'next-env.d.ts'
      )
    })
    .map((p) => ({ path: p, text: readFileSync(p, 'utf8') }))
}

/** Strip block comments and line comments (keeping https:// URLs intact). */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/gm, '$1')
}

function jsChunks(): { path: string; text: string }[] {
  return walkFiles(CHUNKS_DIR)
    .filter((p) => p.endsWith('.js'))
    .map((p) => ({ path: p, text: readFileSync(p, 'utf8') }))
}

beforeAll(async () => {
  rmSync(join(process.cwd(), '.next'), { recursive: true, force: true })
  execSync('npx next build', {
    stdio: 'pipe',
    env: cleanEnv(),
    timeout: 600_000,
  })

  // Port precheck: nothing may already be answering on our port, or the
  // smoke test below would assert against a stale server.
  let portBusy = false
  try {
    await fetch(`http://localhost:${PORT}/`, {
      signal: AbortSignal.timeout(1_000),
    })
    portBusy = true
  } catch {
    // connection refused = port free, which is what we want
  }
  if (portBusy) {
    throw new Error(`port ${PORT} is already in use; refusing to smoke-test`)
  }

  server = spawn(
    'node',
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    { env: cleanEnv(), stdio: 'pipe', detached: true }
  )

  const deadline = Date.now() + 60_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (res.status === 200) {
        ready = true
        break
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('next start did not become ready within 60s')
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    // detached spawn leads its own process group: kill the whole group
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  try {
    server?.kill('SIGKILL')
  } catch {
    // already gone
  }
})

test('production build succeeds', () => {
  expect(existsSync(join(process.cwd(), '.next', 'BUILD_ID'))).toBe(true)
})

test('assetPrefix still points at the CDN origin', () => {
  const configPath = ['next.config.ts', 'next.config.mts', 'next.config.mjs', 'next.config.js']
    .map((f) => join(process.cwd(), f))
    .find((p) => existsSync(p))
  expect(configPath).toBeDefined()
  const config = readFileSync(configPath!, 'utf8')
  expect(config).toMatch(/\bassetPrefix\b/)
  expect(config).toContain(CDN_ORIGIN)
})

test('worker is still compiled as a module chunk group', () => {
  // Blob-shim and public/-hosting rewrites remove the `new Worker(new URL(`
  // form, and with it the emitted worker chunk group.
  const workerChunkFiles = walkFiles(CHUNKS_DIR).filter((p) =>
    /^turbopack-worker-.+\.js$/.test(basename(p))
  )
  expect(workerChunkFiles.length).toBeGreaterThan(0)
})

test('worker bootstrap resolves the worker same-origin, not against the CDN', () => {
  const chunks = jsChunks()

  // The chunk group emitted for the worker must be referenced by some client
  // chunk (the spawning module).
  const spawnChunks = chunks.filter((c) =>
    c.text.includes('static/chunks/turbopack-worker-')
  )
  expect(spawnChunks.length).toBeGreaterThan(0)

  // The worker bootstrap factory (identified by its quoted SharedWorker
  // literal) must pin the worker URL base to the same-origin literal
  // "/_next/" instead of the CDN-derived runtime base.
  const factoryChunks = chunks.filter((c) =>
    /['"]SharedWorker['"]/.test(c.text)
  )
  expect(factoryChunks.length).toBeGreaterThan(0)
  for (const chunk of factoryChunks) {
    expect(chunk.text, basename(chunk.path)).toMatch(/['"]\/_next\/['"]/)
    expect(chunk.text, basename(chunk.path)).not.toMatch(
      new RegExp(`['"]${CDN_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/_next/['"]`)
    )
  }
})

test('worker is still spawned the standard way in source', () => {
  const spawnShape = /new\s+Worker\s*\(\s*new\s+URL\s*\(/
  const hasStandardSpawn = sourceFiles().some(
    (s) => spawnShape.test(s.text) && /import\.meta\.url/.test(s.text)
  )
  expect(hasStandardSpawn).toBe(true)
})

test('no blob-URL or inline-worker workarounds in source', () => {
  for (const s of sourceFiles()) {
    const code = stripComments(s.text)
    expect(code, s.path).not.toMatch(/\bcreateObjectURL\s*\(/)
    expect(code, s.path).not.toMatch(/new\s+Blob\s*\(/)
    expect(code, s.path).not.toMatch(/\bimportScripts\s*\(/)
  }
})

test('no files were added under public/', () => {
  // The fixture ships no public/ directory at all.
  const publicFiles = walkFiles(join(process.cwd(), 'public'))
  expect(publicFiles).toEqual([])
})

test('production server serves the dashboard with CDN-prefixed assets', async () => {
  const res = await fetch(`http://localhost:${PORT}/`)
  expect(res.status).toBe(200)
  const html = await res.text()
  // assetPrefix is live: regular chunks load from the CDN
  expect(html).toContain(`${CDN_ORIGIN}/_next/`)
})

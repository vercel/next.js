/**
 * COMPOSITE fixture: one release, two independent fixes in a field-service
 * dispatch app. A model passes only if it lands BOTH — the per-model kill
 * sets of the two source fixtures complement each other (agent-047's SW leg
 * killed opus/sonnet, agent-072's retention leg killed fable).
 *
 * Leg 1 — bundler-compiled service workers (Turbopack, since 2026-07).
 * `navigator.serviceWorker.register(new URL('./offline-worker', import.meta.url))`
 * in a client component makes the bundler resolve the TS worker module,
 * compile it standalone (with its imports — turbopack-ecmascript
 * references/service_worker.rs), emit it to
 * `.next/static/service-worker/<file>.js` (root scope → `sw.js`, other
 * scopes → `sw-<slug>-<hash>.js`), rewrite the register() argument in the
 * client chunk to the served `/_next/static/service-worker/...` URL with the
 * resolved `scope` pinned, and add a `Service-Worker-Allowed` header route to
 * routes-manifest.json plus mutable caching. Verified by spike on
 * 16.4.0-canary.10 (2026-08-28): the built app emitted
 * `.next/static/service-worker/sw.js` CONTAINING the string exported by the
 * imported `lib/version.ts` util (imports really are compiled in); one chunk
 * under `.next/static/chunks/` contained `/_next/static/service-worker/`;
 * `next start` served the script 200 with `Service-Worker-Allowed: /` and
 * `Cache-Control: public, max-age=0, must-revalidate` + ETag. The analyzer
 * links argument values, so variable-held URLs and wrapper functions compile
 * too; a plain string path (`register('/sw.js')`) creates no reference and
 * emits nothing. Why agents fail: pre-2026-07 training says Next.js cannot
 * bundle service workers — the "known answer" is a hand-copied `public/sw.js`
 * (plus a copy step for TS) or a PWA package, all ruled out by the prompt;
 * the fixture's stub TODO states that stale folklore explicitly.
 *
 * Leg 2 — `unstable_dynamicStaleTime` page segment config (2026-03-16,
 * #91437): per-page client-router retention of DYNAMIC data. After
 * navigating away and back within the window, the router reuses the dynamic
 * navigation response instead of refetching. Pages only (layout export is a
 * loud build error). Server-observable fingerprint (re-verified in the same
 * 2026-08-28 spike, DEFAULT config — no cacheComponents): the dynamic RSC
 * navigation response of a page exporting the config carries a top-level
 * numeric `"d":<seconds>` field (NavigationFlightResponse.d, set in
 * generateDynamicRSCPayload) — the spike served `"d":120` on /jobs while /
 * and /jobs/501 carried no numeric d. Without the config — or with only the
 * global `experimental.staleTimes` — the field is absent. All other `"d":`
 * keys in the payload are object-valued render-tree nodes, so a numeric
 * match is unambiguous. Build validation does not require cacheComponents
 * for this export (get-page-static-info gates only layout/instant combos),
 * so every retention assert here is config-agnostic: an agent may leave the
 * default config or legitimately enable cacheComponents. Only the global
 * `staleTimes` shape stays banned. Why agents fail: 2025-trained agents
 * reach for the global `experimental.staleTimes` (app-wide, emits no
 * per-page field), Router-Cache folklore, or caching the data itself
 * ('use cache' / 'use cache: private' + cacheLife / SWR), which breaks the
 * "list stays per-request fresh" requirement.
 */

import { expect, test, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, sep } from 'node:path'

const PORT = 4085
const ROOT = process.cwd()

// ---------------------------------------------------------------------------
// Leg 1 (offline worker) constants
// ---------------------------------------------------------------------------

// The single-sourced shell version string shipped in lib/version.ts. The
// compiled worker must contain it (proof the worker imports the util through
// the bundler) while no other source file duplicates it.
const SHELL_MARKER = 'fieldkit-shell-v7_3f9a'
const VERSION_LIB = join(ROOT, 'lib', 'version.ts')
const SW_DIR = join(ROOT, '.next', 'static', 'service-worker')
const CHUNKS_DIR = join(ROOT, '.next', 'static', 'chunks')
const SW_URL_PREFIX = '/_next/static/service-worker/'

// ---------------------------------------------------------------------------
// Leg 2 (jobs list retention) constants
// ---------------------------------------------------------------------------

const JOBS_PAGE_REL = join('app', 'jobs', 'page.tsx')
const EXPORT_SHAPE = /export\s+(const|let|var)\s+unstable_dynamicStaleTime\b/

let server: ChildProcess | undefined
let serverLog = ''

function cleanEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(PORT),
  }
  // vitest sets NODE_ENV=test, which breaks next build/start.
  delete env.NODE_ENV
  return env as unknown as NodeJS.ProcessEnv
}

function buildOnce() {
  execSync('node node_modules/next/dist/bin/next build', {
    stdio: 'pipe',
    env: cleanEnv(),
    cwd: ROOT,
    timeout: 600_000,
  })
}

function walk(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const d of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!d.isFile()) continue
    out.push(join((d as any).parentPath ?? (d as any).path, d.name))
  }
  return out
}

function readSafe(p: string): string {
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Strips comments before applying ban-shape regexes so that prose merely
 * mentioning a banned name (the pristine stub's TODO, an agent's notes)
 * never fails a solution. Keeps `//` that follows a quote or colon so string
 * URLs survive; over-stripping can only relax a ban, never reject a fix.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

/**
 * Source files the agent controls: everything under the fixture root except
 * deps, build output, git internals, and the harness's own runtime dir
 * (__agent_eval__, injected into the sandbox cwd after the agent finishes).
 * EVAL harness files are not part of the solution.
 */
function sourceFiles(): { p: string; code: string }[] {
  const skip = new Set(['node_modules', '.next', '.git', '__agent_eval__'])
  const files: string[] = []
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue
    const full = join(ROOT, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
    .filter((p) => {
      const base = p.split(sep).pop()!
      if (base.startsWith('EVAL')) return false
      return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
    })
    .map((p) => ({ p, code: stripComments(readSafe(p)) }))
}

function existingNextConfigs(): string[] {
  return [
    'next.config.ts',
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
  ].filter((p) => existsSync(join(ROOT, p)))
}

async function get(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, text: await res.text() }
}

/**
 * The router's dynamic navigation request. The server 307-redirects RSC
 * requests missing the `_rsc` cache-busting param; fetch follows it
 * same-origin with headers preserved.
 */
async function fetchRsc(
  path: string
): Promise<{ status: number; body: string }> {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    headers: { RSC: '1' },
    signal: AbortSignal.timeout(15_000),
  })
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

// ---------------------------------------------------------------------------
// Lifecycle: one build, one server for both legs
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Fail fast if something is already listening on our port — otherwise we
  // would silently test a stale leaked server. lsof exits 0 iff a listener
  // exists.
  let portBusy = true
  try {
    execSync(`lsof -nP -iTCP:${PORT} -sTCP:LISTEN`, { stdio: 'pipe' })
  } catch {
    portBusy = false
  }
  if (portBusy) {
    throw new Error(
      `port ${PORT} is already in use — kill the stale server before running EVAL`
    )
  }

  // The agent's `.next` may be stale; always rebuild.
  rmSync(join(ROOT, '.next'), { recursive: true, force: true })
  buildOnce()

  server = spawn(
    'node',
    ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)],
    { env: cleanEnv(), cwd: ROOT, stdio: 'pipe', detached: true }
  )
  server.stdout?.on('data', (c) => (serverLog += String(c)))
  server.stderr?.on('data', (c) => (serverLog += String(c)))

  const deadline = Date.now() + 60_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (res.status < 500) {
        ready = true
        break
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!ready) {
    throw new Error(
      `next start did not become ready on port ${PORT}:\n${serverLog}`
    )
  }
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      try {
        server.kill('SIGKILL')
      } catch {
        // already gone
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Leg 1: the offline worker must be compiled by the framework
// ---------------------------------------------------------------------------

test('the build emits a compiled service worker artifact', () => {
  const artifacts = walk(SW_DIR).filter((f) => /\.js$/.test(f))
  expect(
    artifacts.length,
    'no compiled worker under .next/static/service-worker/ — the worker ' +
      'module was not picked up by the bundler'
  ).toBeGreaterThan(0)
})

test('the compiled worker shares the shell-version util through an import', () => {
  const hit = walk(SW_DIR).some((f) => readSafe(f).includes(SHELL_MARKER))
  expect(
    hit,
    `no compiled worker artifact contains the shell version string ` +
      `(${SHELL_MARKER}) exported by lib/version.ts — the worker source must ` +
      `import the shared util and be compiled with it`
  ).toBe(true)
})

test('registration points at the worker module, not a hand-served path', () => {
  const sources = sourceFiles()
  const registrar = sources.find(
    (s) =>
      /serviceWorker/.test(s.code) &&
      /\bregister\s*\(/.test(s.code) &&
      /new\s+URL\s*\(/.test(s.code) &&
      /import\s*\.\s*meta\s*\.\s*url/.test(s.code)
  )
  expect(
    registrar,
    'no source file registers the service worker from a module URL ' +
      '(a serviceWorker register(...) call plus a new URL(..., import.meta.url) ' +
      'in the same file)'
  ).toBeTruthy()

  // A string-path registration (register('/sw.js')) bypasses the bundler and
  // can only work with a hand-served file.
  for (const s of sources) {
    expect(
      /\bregister\s*\(\s*['"]/.test(s.code),
      `string-path register() found in ${s.p}`
    ).toBe(false)
  }
})

test('a client chunk references the served worker URL', () => {
  const chunks = walk(CHUNKS_DIR)
  expect(chunks.length).toBeGreaterThan(0)
  const hit = chunks.some((f) => readSafe(f).includes(SW_URL_PREFIX))
  expect(
    hit,
    `no built client chunk references ${SW_URL_PREFIX} — the register() call ` +
      'was not rewritten by the bundler'
  ).toBe(true)
})

test(
  'the worker script is served with the service-worker headers',
  { timeout: 60_000 },
  async () => {
    const artifact =
      walk(SW_DIR).find((f) => readSafe(f).includes(SHELL_MARKER)) ??
      walk(SW_DIR).find((f) => /\.js$/.test(f))
    expect(artifact, 'no compiled worker artifact to serve').toBeTruthy()
    const url = SW_URL_PREFIX + basename(artifact!)
    const res = await fetch(`http://localhost:${PORT}${url}`, {
      signal: AbortSignal.timeout(15_000),
    })
    expect(res.status, `GET ${url}`).toBe(200)
    expect(
      res.headers.get('service-worker-allowed'),
      `${url} is missing the Service-Worker-Allowed header`
    ).toBeTruthy()
    expect(await res.text()).toContain(SHELL_MARKER)
  }
)

test('no scripts are hand-copied into public/', () => {
  const pub = join(ROOT, 'public')
  const scripts = walk(pub).filter((f) =>
    /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(f.split(sep).pop()!)
  )
  // The pristine fixture ships no public/ directory at all; a correct fix
  // never needs a script there.
  expect(scripts, 'script files found in public/').toEqual([])
})

test('no extra build step or PWA package added', () => {
  const pkg = JSON.parse(readSafe(join(ROOT, 'package.json')))
  expect(pkg.scripts.build).toBe('next build')
  const allDeps = JSON.stringify({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })
  expect(allDeps).not.toMatch(/next-pwa|serwist|workbox/)
})

test('the shell version string stays single-sourced in lib/version.ts', () => {
  expect(
    readSafe(VERSION_LIB),
    'lib/version.ts no longer carries the shell version string'
  ).toContain(SHELL_MARKER)
  for (const s of sourceFiles()) {
    if (s.p === VERSION_LIB) continue
    expect(
      s.code.includes(SHELL_MARKER),
      `shell version string duplicated into ${s.p}`
    ).toBe(false)
  }
})

// ---------------------------------------------------------------------------
// Leg 2: jobs list router retention
// ---------------------------------------------------------------------------

test('the jobs list page opts into per-page router retention', () => {
  const code = stripComments(readSafe(join(ROOT, JOBS_PAGE_REL)))
  expect(code.length, `${JOBS_PAGE_REL} is missing`).toBeGreaterThan(0)
  expect(code).toMatch(EXPORT_SHAPE)
})

test('the retention config is scoped to the jobs list page only', () => {
  const listPage = join(ROOT, JOBS_PAGE_REL)
  for (const s of sourceFiles()) {
    if (s.p === listPage) continue
    expect(s.code, `unexpected retention export in ${s.p}`).not.toMatch(
      EXPORT_SHAPE
    )
  }
})

test('no global router stale-time workaround in next.config', () => {
  for (const p of existingNextConfigs()) {
    expect(
      stripComments(readSafe(join(ROOT, p))),
      `global staleTimes in ${p}`
    ).not.toMatch(/\bstaleTimes\b\s*[:=]/)
  }
})

test('the jobs list data path stays uncached (no shared caching)', () => {
  for (const p of [JOBS_PAGE_REL, join('lib', 'jobs.ts')]) {
    if (!existsSync(join(ROOT, p))) continue
    expect(
      stripComments(readSafe(join(ROOT, p))),
      `'use cache' in ${p}`
    ).not.toMatch(/['"]use cache['"]/)
  }
})

test(
  'the jobs list stays dynamic: two visits render fresh data',
  { timeout: 120_000 },
  async () => {
    const res1 = await get('/jobs')
    const res2 = await get('/jobs')
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    const m1 = res1.text.match(/Data refreshed ([^<]+)</)
    const m2 = res2.text.match(/Data refreshed ([^<]+)</)
    if (m1 && m2) {
      expect(m1[1]).not.toBe(m2[1])
    } else {
      // Markup was refactored; the dynamic payload must still differ.
      expect(res1.text).not.toBe(res2.text)
    }
  }
)

test(
  'the dynamic navigation response carries a ~2 minute retention window for the list',
  { timeout: 120_000 },
  async () => {
    const { status, body } = await fetchRsc('/jobs')
    expect(status).toBe(200)
    const ds = numericDValues(body)
    expect(
      ds.some((v) => v >= 90 && v <= 180),
      `expected a retention field between 90 and 180 seconds in the /jobs flight payload, saw: [${ds.join(', ')}]`
    ).toBe(true)
  }
)

test(
  "other pages keep today's behavior: no retention field on home or detail",
  { timeout: 120_000 },
  async () => {
    for (const path of ['/', '/jobs/501']) {
      const { status, body } = await fetchRsc(path)
      expect(status).toBe(200)
      const ds = numericDValues(body)
      expect(ds, `unexpected retention field on ${path}`).toEqual([])
    }
  }
)

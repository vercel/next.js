/**
 * COMPOSITE fixture: one release, two independent regressions. Part 1 is the
 * Vite → Next.js port of agent-074-vite-migration (kept verbatim); Part 2 is
 * the per-page router-retention fix of agent-072-dynamic-stale, re-themed to
 * a meal-orders section of the same app. A model passes only if it lands BOTH
 * — the per-model kill sets of the two sources complement each other.
 *
 * Part 1 — the port is only correct if the Vite-native import.meta APIs are
 * KEPT, not rewritten. Turbopack (the default bundler) natively supports the
 * whole family on this canary (16.4.0-canary.10):
 *   - `import.meta.glob` since 2026-07-27 (3f2cf7e1a0; eager/import/query/
 *     base/caseSensitive; TS generic 2026-08-11 7b848a4e2b), plus webpack's
 *     `require.context`.
 *   - `import.meta.env.{DEV,PROD,MODE,BASE_URL,SSR}` since 2026-07-28
 *     (c23d1a946c). SSR is a per-bundle constant: true in server bundles,
 *     false in browser bundles — process.env has no equivalent.
 *   - `with { type: 'text' }` import attributes on by default since
 *     2026-07-08 (dd27732f54), and `type: 'text' | 'raw' | 'asset'`
 *     turbopack.rules.
 * Predicted failures: fs.readdir in a server component, route handlers,
 * hard-coded import maps, eager/?raw globs (bodies land in the page's own
 * chunks), copy-pasting the disclaimer into JSX, and rewriting the badge to
 * process.env.NODE_ENV + typeof window. Verified port gotchas the compliant
 * solution navigates: glob patterns only strip a leading `./` (a `../`
 * pattern silently matches nothing), and the docs-blessed lazy
 * `{ query: '?raw' }` + text rule inlines bodies into the page's own chunks —
 * the compliant form maps a query (e.g. '?url') to `type: 'asset'` in
 * turbopack.rules and fetch()es the emitted file on demand.
 *
 * Part 2 — `unstable_dynamicStaleTime` page segment config (2026-03-16,
 * #91437): per-page client-router retention of DYNAMIC data. Pages only
 * (layout export is a build error; combining with `instant` is too).
 * Server-observable fingerprint: the dynamic RSC navigation response of a
 * page exporting the config carries a top-level numeric `"d":<seconds>` field
 * (NavigationFlightResponse.d, set in generateDynamicRSCPayload). Without the
 * config — or with only the global `experimental.staleTimes` — the field is
 * absent. All other `"d":` keys in the payload are object-valued render-tree
 * nodes, so a numeric match is unambiguous. Why agents fail: they reach for
 * the global `experimental.staleTimes` (app-wide, produces no per-page
 * field), Router-Cache folklore, or caching the data itself ('use cache' /
 * SWR), which breaks the "list stays per-request fresh" requirement.
 *
 * CONFIG-BRANCH DECISION (verified 2026-08-28 on 16.4.0-canary.10): unlike
 * agent-072, this app runs the DEFAULT config — no cacheComponents. Verified
 * empirically that `unstable_dynamicStaleTime` works without the flag: build
 * validation gates only the layout/instant combinations (`prefetch` requires
 * cacheComponents, unstable_dynamicStaleTime does not —
 * dist/build/analysis/get-page-static-info.js), the `d` field is emitted
 * ungated in generateDynamicRSCPayload (dist/server/app-render/app-render.js
 * baseResponse.d), and a spike app under the default config served
 * `"d":120}` in the /orders flight payload while / and /orders/1001 carried
 * no numeric d. The 072 asserts are therefore ported with the
 * "cacheComponents stays on" clause dropped: an agent may leave the config
 * default or legitimately enable cacheComponents — every retention assert
 * here is config-agnostic. Only the global `staleTimes` shape stays banned.
 *
 * Accepted alternates (outcome asserts decide): import.meta.glob or
 * require.context for enumeration; any query/rule combination that keeps
 * bodies out of the JS and emits them as static files; `with`/`assert`
 * `{ type: 'text' | 'raw' }` import attributes, a text/raw turbopack rule
 * with a plain or query import, or a ?raw glob for the disclaimer; dot,
 * bracket, destructured, or aliased access to import.meta.env props; DEV or
 * PROD instead of MODE for the mode half of the badge; any
 * unstable_dynamicStaleTime value in [90, 180] seconds.
 */

import { expect, test, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, sep } from 'node:path'

const PORT = 4084
const ROOT = process.cwd()

// ---------------------------------------------------------------------------
// Part 1 (recipe port) constants and helpers
// ---------------------------------------------------------------------------

const RECIPE_IDS = [
  'apple-pie',
  'beef-stew',
  'garlic-naan',
  'lemon-tart',
  'miso-soup',
  'pad-thai',
]
const marker = (id: string) => `RECIPE_BODY_${id}`
// Tolerates prettified titles: "apple-pie", "Apple Pie", "apple pie"…
const stemRegex = (id: string) =>
  new RegExp(id.split('-').join('[\\s\\-_.]*'), 'i')

const ADDED_ID = 'added-by-eval'
const ADDED_FILE = join(ROOT, 'content', 'recipes', 'added-by-eval-check.md')
const ADDED_STEM = /added[\s\-_.]*by[\s\-_.]*eval[\s\-_.]*check/i

const DISCLAIMER_PATH = join(ROOT, 'disclaimer.txt')
const DISCLAIMER_MARKER = 'RECIPE_DISCLAIMER_MARKER_9c41'
const DISCLAIMER_SENTENCE =
  'Always confirm cooking temperatures for meat, poultry, and eggs with a calibrated thermometer.'
const PROBE = 'DISCLAIMER_EDIT_PROBE_55e1'

// Read the disclaimer as the agent left it, dropping any probe line a killed
// earlier eval run may have leaked into the file.
const ORIGINAL_DISCLAIMER = readFileSync(DISCLAIMER_PATH, 'utf-8')
  .split('\n')
  .filter((line) => !line.includes(PROBE))
  .join('\n')

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

const CHUNKS_DIR = join(ROOT, '.next', 'static', 'chunks')

function chunkFiles(): string[] {
  return walk(CHUNKS_DIR)
}

/** Emitted static files that are NOT chunk JS (e.g. .next/static/media/**). */
function staticNonChunkFiles(): string[] {
  return walk(join(ROOT, '.next', 'static')).filter(
    (p) => !p.startsWith(CHUNKS_DIR + sep)
  )
}

function prerenderedHtml(): string {
  return readSafe(join(ROOT, '.next', 'server', 'app', 'index.html'))
}

function rscPayload(): string {
  return readSafe(join(ROOT, '.next', 'server', 'app', 'index.rsc'))
}

/**
 * Source files the agent controls. Excludes deps, build output, content, the
 * old Vite app kept as a read-only reference (vite-src/), and EVAL itself.
 */
function sourceFiles(): { p: string; code: string }[] {
  // __agent_eval__ is the harness's own runtime dir, injected into the
  // sandbox cwd after the agent finishes — its helper files use fs and must
  // never count against the agent's solution.
  const skip = new Set([
    'node_modules',
    '.next',
    'content',
    '.git',
    'vite-src',
    '__agent_eval__',
  ])
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

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Visible text of an HTML document: scripts, styles, comments, tags gone. */
function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
}

/**
 * Does `code` read the given property of import.meta.env? Tolerates dot and
 * bracket access, destructuring, and aliases (const env = import.meta.env).
 */
function refsEnvProp(code: string, props: string[]): boolean {
  const alt = props.join('|')
  const shapes = (obj: string) => [
    new RegExp(`${obj}\\s*\\.\\s*(?:${alt})\\b`),
    new RegExp(`${obj}\\s*\\[\\s*['"](?:${alt})['"]\\s*\\]`),
    new RegExp(`\\{[^{}]*\\b(?:${alt})\\b[^{}]*\\}\\s*=\\s*${obj}\\b`),
  ]
  const META_ENV = 'import\\s*\\.\\s*meta\\s*\\.\\s*env'
  if (shapes(META_ENV).some((re) => re.test(code))) return true
  const aliasRe = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${META_ENV}\\b(?!\\s*[.[])`,
    'g'
  )
  let m: RegExpExecArray | null
  while ((m = aliasRe.exec(code))) {
    const alias = m[1].replace(/\$/g, '\\$')
    if (shapes(`\\b${alias}`).some((re) => re.test(code))) return true
  }
  return false
}

async function get(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, text: await res.text() }
}

// ---------------------------------------------------------------------------
// Part 2 (meal-orders retention) constants and helpers
// ---------------------------------------------------------------------------

const ORDERS_PAGE_REL = join('app', 'orders', 'page.tsx')
const EXPORT_SHAPE = /export\s+(const|let|var)\s+unstable_dynamicStaleTime\b/

function existingNextConfigs(): string[] {
  return [
    'next.config.ts',
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
  ].filter((p) => existsSync(join(ROOT, p)))
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
// Lifecycle: one build, one server for both parts
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

  rmSync(join(ROOT, '.next'), { recursive: true, force: true })
  // Leftovers from an aborted earlier run must not help or hurt this one.
  rmSync(ADDED_FILE, { force: true })
  writeFileSync(DISCLAIMER_PATH, ORIGINAL_DISCLAIMER)

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
  rmSync(ADDED_FILE, { force: true })
  writeFileSync(DISCLAIMER_PATH, ORIGINAL_DISCLAIMER)
})

// ---------------------------------------------------------------------------
// Part 1: the Vite port
// ---------------------------------------------------------------------------

test('no recipe body ships in the prerendered page or the RSC payload', () => {
  const html = prerenderedHtml()
  const rsc = rscPayload()
  expect(html.length).toBeGreaterThan(0)
  for (const id of RECIPE_IDS) {
    expect(html).not.toContain(marker(id))
    expect(rsc).not.toContain(marker(id))
  }
})

test('no recipe body ships in any client chunk JS (the grep audit)', () => {
  const chunks = chunkFiles()
  expect(chunks.length).toBeGreaterThan(0)
  for (const file of chunks) {
    const content = readSafe(file)
    for (const id of RECIPE_IDS) {
      expect(
        content.includes(marker(id)),
        `${marker(id)} found in ${file}`
      ).toBe(false)
    }
  }
})

test('every recipe body is emitted as an on-demand static file', () => {
  const blobs = staticNonChunkFiles().map((f) => ({ f, content: readSafe(f) }))
  for (const id of RECIPE_IDS) {
    const hit = blobs.find((b) => b.content.includes(marker(id)))
    expect(
      hit,
      `no emitted static file (outside chunk JS) contains ${marker(id)}`
    ).toBeTruthy()
  }
})

test(
  'the served page lists every recipe without shipping any body',
  { timeout: 60_000 },
  async () => {
    const page = await get('/')
    expect(page.status).toBe(200)
    for (const id of RECIPE_IDS) {
      expect(
        stemRegex(id).test(page.text),
        `recipe ${id} is not listed on the page`
      ).toBe(true)
      expect(page.text).not.toContain(marker(id))
    }
  }
)

test(
  'a recipe body is served over the network on demand',
  { timeout: 60_000 },
  async () => {
    const id = RECIPE_IDS[0]
    const assetFile = staticNonChunkFiles().find((f) =>
      readSafe(f).includes(marker(id))
    )
    expect(assetFile, `no static asset contains ${marker(id)}`).toBeTruthy()
    const staticRoot = join(ROOT, '.next', 'static') + sep
    const url =
      '/_next/static/' +
      assetFile!.slice(staticRoot.length).split(sep).join('/')
    const res = await get(url)
    expect(res.status).toBe(200)
    expect(res.text).toContain(marker(id))
  }
)

test('a directory-scanning bundler API is used, not fs or endpoints', () => {
  const sources = sourceFiles()

  // The Vite API works in Next.js — the port must enumerate the files
  // through the bundler. Turbopack supports both import.meta.glob and
  // webpack's require.context, so either counts.
  const hasBundlerScan = sources.some(
    (s) =>
      /import\s*\.\s*meta\s*\.\s*glob\s*[<(]/.test(s.code) ||
      /require\s*\.\s*context\s*\(/.test(s.code)
  )
  expect(
    hasBundlerScan,
    'no import.meta.glob( or require.context( call found outside comments in any source file'
  ).toBe(true)

  // No filesystem enumeration or file reading in app code.
  const banned: Array<[RegExp, string]> = [
    [/\breaddir(?:Sync)?\b/, 'fs readdir'],
    [/\breadFile(?:Sync)?\b/, 'fs readFile'],
    [/from\s+['"](?:node:)?fs(?:\/promises)?['"]/, 'fs import'],
    [/require\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]\s*\)/, 'fs require'],
  ]
  for (const s of sources) {
    for (const [re, label] of banned) {
      expect(re.test(s.code), `${label} found in ${s.p}`).toBe(false)
    }
  }

  // No hard-coded per-file imports of the markdown recipes.
  for (const s of sources) {
    expect(
      /import\s[^'"]*from\s+['"][^'"]*\.md[^'"]*['"]/.test(s.code),
      `static per-file .md import found in ${s.p}`
    ).toBe(false)
  }

  // No route handlers (the prompt bans server endpoints for this feature).
  const routeFiles = walk(join(ROOT, 'app')).filter((p) =>
    /^route\.(ts|tsx|js|jsx|mjs)$/.test(p.split(sep).pop()!)
  )
  expect(routeFiles, `route handlers found: ${routeFiles.join(', ')}`).toEqual(
    []
  )
})

test(
  'the footer renders disclaimer.txt verbatim in the prerendered HTML',
  { timeout: 60_000 },
  async () => {
    const html = prerenderedHtml()
    expect(html).toContain(DISCLAIMER_MARKER)
    expect(normalize(htmlText(html))).toContain(normalize(ORIGINAL_DISCLAIMER))

    const page = await get('/')
    expect(page.status).toBe(200)
    expect(page.text).toContain(DISCLAIMER_MARKER)
  }
)

test('the disclaimer stays single-sourced and reaches the page through the bundler', () => {
  const sources = sourceFiles()

  // The wording must not be duplicated into any source file.
  for (const s of sources) {
    expect(
      s.code.includes(DISCLAIMER_MARKER),
      `disclaimer marker duplicated into ${s.p}`
    ).toBe(false)
    expect(
      normalize(s.code).includes(normalize(DISCLAIMER_SENTENCE)),
      `disclaimer wording duplicated into ${s.p}`
    ).toBe(false)
  }

  // A bundler-native raw-text mechanism exists: an import attribute
  // (`with`/`assert` { type: 'text' | 'raw' }), a text/raw turbopack rule, or
  // a glob over the txt file.
  const importAttrText =
    /from\s*(['"])[^'"]*\.txt(?:\?[^'"]*)?\1\s*(?:with|assert)\s*\{\s*(['"]?)type\2\s*:\s*(['"])(?:text|raw)\3\s*,?\s*\}/
  const dynamicAttrText =
    /import\s*\(\s*(['"])[^'"]*\.txt(?:\?[^'"]*)?\1\s*,\s*\{\s*(?:with|assert)\s*:\s*\{\s*(['"]?)type\2\s*:\s*(['"])(?:text|raw)\3/
  const ruleText = /type\s*:\s*(['"])(?:text|raw)\1/
  const globTxt = /import\s*\.\s*meta\s*\.\s*glob\s*[<(][^)]*\.txt/
  const hasTextMech = sources.some(
    (s) =>
      importAttrText.test(s.code) ||
      dynamicAttrText.test(s.code) ||
      ruleText.test(s.code) ||
      globTxt.test(s.code)
  )
  expect(
    hasTextMech,
    'no bundler-native raw text import (import attribute, text/raw rule, or txt glob) found outside comments'
  ).toBe(true)
})

test('the prerendered badge is truthful: env=server plus the build mode', () => {
  const visible = normalize(htmlText(prerenderedHtml()))
  expect(visible).toContain('env=server')
  expect(visible).toContain('mode=production')
  expect(visible).not.toContain('env=client')
  expect(visible).not.toContain('env=unknown')
  expect(visible).not.toContain('mode=unknown')
})

test('the badge reads the bundler env, not process.env.NODE_ENV', () => {
  const sources = sourceFiles()

  expect(
    sources.some((s) => refsEnvProp(s.code, ['SSR'])),
    'nothing outside comments reads the SSR flag of import.meta.env'
  ).toBe(true)
  expect(
    sources.some((s) => refsEnvProp(s.code, ['MODE', 'DEV', 'PROD'])),
    'nothing outside comments reads MODE/DEV/PROD of import.meta.env'
  ).toBe(true)

  // Files that produce the badge output must not fall back to
  // process.env.NODE_ENV (fine elsewhere, not in the badge).
  const badgeFiles = sources.filter(
    (s) => /\benv=/.test(s.code) || /\bmode=/.test(s.code)
  )
  expect(badgeFiles.length, 'no badge source file found').toBeGreaterThan(0)
  for (const s of badgeFiles) {
    expect(
      /process\s*\.\s*env\s*\.\s*NODE_ENV/.test(s.code),
      `process.env.NODE_ENV found in badge file ${s.p}`
    ).toBe(false)
  }
})

// ---------------------------------------------------------------------------
// Part 2: meal-orders router retention
// ---------------------------------------------------------------------------

test('the meal-orders list page opts into per-page router retention', () => {
  const code = stripComments(readSafe(join(ROOT, ORDERS_PAGE_REL)))
  expect(code.length, `${ORDERS_PAGE_REL} is missing`).toBeGreaterThan(0)
  expect(code).toMatch(EXPORT_SHAPE)
})

test('the retention config is scoped to the orders list page only', () => {
  const listPage = join(ROOT, ORDERS_PAGE_REL)
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

test('the orders list data path stays uncached (no shared caching)', () => {
  for (const p of [ORDERS_PAGE_REL, join('lib', 'orders.ts')]) {
    if (!existsSync(join(ROOT, p))) continue
    expect(
      stripComments(readSafe(join(ROOT, p))),
      `'use cache' in ${p}`
    ).not.toMatch(/['"]use cache['"]/)
  }
})

test(
  'the orders list stays dynamic: two visits render fresh data',
  { timeout: 120_000 },
  async () => {
    const res1 = await get('/orders')
    const res2 = await get('/orders')
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
    const { status, body } = await fetchRsc('/orders')
    expect(status).toBe(200)
    const ds = numericDValues(body)
    expect(
      ds.some((v) => v >= 90 && v <= 180),
      `expected a retention field between 90 and 180 seconds in the /orders flight payload, saw: [${ds.join(', ')}]`
    ).toBe(true)
  }
)

test(
  "other pages keep today's behavior: no retention field on home or detail",
  { timeout: 120_000 },
  async () => {
    for (const path of ['/', '/orders/1001']) {
      const { status, body } = await fetchRsc(path)
      expect(status).toBe(200)
      const ds = numericDValues(body)
      expect(ds, `unexpected retention field on ${path}`).toEqual([])
    }
  }
)

// ---------------------------------------------------------------------------
// Rebuild leg last: it rebuilds .next under the running server, so every
// live-fetch assertion above must already have run.
// ---------------------------------------------------------------------------

test(
  'content edits appear after a rebuild with zero code changes',
  { timeout: 700_000 },
  () => {
    writeFileSync(
      ADDED_FILE,
      `# Added by eval\n\n${marker(ADDED_ID)}\n\nThis file was dropped into content/recipes/ by the eval harness.\n`
    )
    writeFileSync(
      DISCLAIMER_PATH,
      `${ORIGINAL_DISCLAIMER.trimEnd()}\n${PROBE} appended by the eval harness.\n`
    )
    try {
      buildOnce()

      // The new recipe body is emitted as an on-demand static file, not into
      // chunk JS, the HTML, or the RSC payload.
      const staticHit = staticNonChunkFiles().some((f) =>
        readSafe(f).includes(marker(ADDED_ID))
      )
      expect(
        staticHit,
        'added recipe body was not emitted as a static file'
      ).toBe(true)

      for (const file of chunkFiles()) {
        expect(
          readSafe(file).includes(marker(ADDED_ID)),
          `added recipe body found in chunk ${file}`
        ).toBe(false)
      }

      const html = prerenderedHtml()
      expect(html).not.toContain(marker(ADDED_ID))
      expect(rscPayload()).not.toContain(marker(ADDED_ID))

      // The new recipe shows up in the list (rendered page or the key map
      // inside the client JS) without any code change.
      const chunksConcat = chunkFiles()
        .map((f) => readSafe(f))
        .join('\n')
      expect(
        ADDED_STEM.test(html) || ADDED_STEM.test(chunksConcat),
        'added recipe does not appear in the rebuilt list'
      ).toBe(true)

      // The edited disclaimer flows into the rebuilt HTML from the txt file.
      expect(
        normalize(htmlText(html)).includes(PROBE),
        'edited disclaimer.txt did not change the rebuilt footer'
      ).toBe(true)
    } finally {
      rmSync(ADDED_FILE, { force: true })
      writeFileSync(DISCLAIMER_PATH, ORIGINAL_DISCLAIMER)
    }
  }
)

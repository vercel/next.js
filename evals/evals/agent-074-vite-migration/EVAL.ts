/**
 * Vite → Next.js port: the port is only correct if the Vite-native
 * import.meta APIs are KEPT, not rewritten.
 *
 * Turbopack (the default bundler) natively supports the whole family on this
 * canary (16.4.0-canary.10):
 *   - `import.meta.glob` since 2026-07-27 (3f2cf7e1a0; eager/import/query/
 *     base/caseSensitive; TS generic 2026-08-11 7b848a4e2b), plus webpack's
 *     `require.context`.
 *   - `import.meta.env.{DEV,PROD,MODE,BASE_URL,SSR}` since 2026-07-28
 *     (c23d1a946c; test/e2e/import-meta-env/). SSR is a per-bundle constant:
 *     true in server bundles, false in browser bundles — process.env has no
 *     equivalent.
 *   - `with { type: 'text' }` import attributes on by default since
 *     2026-07-08 (dd27732f54; test/e2e/turbopack-import-with-type/), and
 *     `type: 'text' | 'raw' | 'asset'` turbopack.rules.
 *
 * A 2025-trained agent firmly believes import.meta.* is a Vite-ism that must
 * be rewritten when porting to Next.js — the fixture's stub comments claim
 * exactly that, and the prompt tells the agent to verify the claim instead of
 * trusting it. Predicted failures: fs.readdir in a server component (bodies
 * land in RSC payload/HTML; fs is banned), route handlers (banned: static
 * bundle), hard-coded import maps (add-a-file rebuild test), eager/?raw globs
 * (bodies ship in the page's own chunks — glob-matched modules use
 * ChunkingType::Parallel, verified in the agent-067 spike), copy-pasting the
 * disclaimer into JSX (single-source + edit-and-rebuild assertions), and
 * rewriting the badge to process.env.NODE_ENV + typeof window (source
 * assertions on the badge file).
 *
 * Two verified port gotchas the compliant solution navigates:
 *   - Turbopack glob patterns only strip a leading `./`; a `../` pattern
 *     silently matches nothing (import_meta_glob.rs strip_relative_prefix),
 *     so the index at the project root must glob './content/recipes/*.md'.
 *   - The docs-blessed lazy `{ query: '?raw' }` + text rule inlines bodies
 *     into the page's own chunks; the compliant form maps a query (e.g.
 *     '?url') to `type: 'asset'` in turbopack.rules, emitting each .md as a
 *     hashed static file and fetch()ing it on demand.
 *
 * Accepted alternates (outcome asserts decide): import.meta.glob or
 * require.context for enumeration; any query/rule combination that keeps
 * bodies out of the JS and emits them as static files; `with`/`assert`
 * `{ type: 'text' | 'raw' }` import attributes, a text/raw turbopack rule
 * with a plain or query import, or a ?raw glob for the disclaimer; dot,
 * bracket, destructured, or aliased access to import.meta.env props; DEV or
 * PROD instead of MODE for the mode half of the badge.
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

const PORT = 4074
const ROOT = process.cwd()

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

beforeAll(async () => {
  // Fail fast if something is already answering on our port — otherwise we
  // would silently test a stale leaked server.
  let alreadyUp = false
  try {
    await fetch(`http://localhost:${PORT}/`, {
      signal: AbortSignal.timeout(1_000),
    })
    alreadyUp = true
  } catch {
    // expected: nothing listening
  }
  if (alreadyUp) {
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
    throw new Error(`next start did not become ready on port ${PORT}`)
  }
}, 800_000)

afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  rmSync(ADDED_FILE, { force: true })
  writeFileSync(DISCLAIMER_PATH, ORIGINAL_DISCLAIMER)
})

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

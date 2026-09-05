/**
 * Vite → Next.js port: import.meta.glob over markdown content, truly lazy
 *
 * Turbopack natively supports Vite's `import.meta.glob` since 2026-07-27
 * (3f2cf7e1a0; options eager/import/query/base/caseSensitive; TS generic arg
 * 2026-08-11 7b848a4e2b). `with { type: 'text' }` imports are on by default
 * since 2026-07-08 (dd27732f54), and `import.meta.env.{DEV,PROD,MODE,...}`
 * since 2026-07-28 (c23d1a946c). A 2025-trained agent firmly believes
 * import.meta.glob is a Vite-ism that must be rewritten to fs.readdir,
 * require.context, or an API route when porting to Next.js — the fixture's
 * stub comment says exactly that, and the prompt asks the agent to verify
 * the claim instead of trusting it.
 *
 * Second trap (verified empirically on 16.4.0-canary.10): the docs-blessed
 * lazy form `import.meta.glob('...', { query: '?raw' })` + a `type: 'text'`
 * rule produces thunks of `Promise.resolve().then(require)` — glob-matched
 * modules use ChunkingType::Parallel (turbopack-ecmascript
 * references/import_meta_glob.rs), so every doc body ships inside the page's
 * own client chunks at any file size. The prompt's "grep the built JS" audit
 * requirement makes that non-compliant. The compliant port globs the files
 * with a `?url` query (or plain) mapped to `type: 'asset'` in
 * `turbopack.rules`, which emits each .md as a hashed static asset under
 * .next/static/media/ and leaves only tiny URLs in the JS; bodies are then
 * fetch()ed on click. Predicted failures: fs.readdirSync in a server
 * component passing bodies as props (markers land in the RSC payload/HTML),
 * hard-coded import maps (add-a-file test), route handlers (banned by
 * prompt: static-bundle constraint), and eager/?raw globs (bodies in chunk
 * JS). Turbopack also implements webpack's require.context on this canary
 * (turbopack-ecmascript references/require_context.rs), so a
 * require.context-based port that meets the same outcome assertions is
 * accepted as a legitimate directory-scanning alternative.
 */

import { expect, test, beforeAll, afterAll } from 'vitest'
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs'
import { join, sep } from 'node:path'

const PORT = 4067
const ROOT = process.cwd()

const DOC_IDS = ['v1-0', 'v1-1', 'v2-0', 'v2-1', 'v3-0', 'v3-2']
const marker = (id: string) => `CHANGELOG_BODY_MARKER_${id}`
// Tolerates prettified titles: "release-v1-0", "Release v1.0", "release v1 0"…
const stemRegex = (id: string) => {
  const [major, minor] = id.slice(1).split('-')
  return new RegExp(`release[\\s\\-_.]*v${major}[\\s\\-_.]*${minor}`, 'i')
}

const ADDED_ID = 'added-by-eval'
const ADDED_FILE = join(ROOT, 'content', 'added-by-eval-check.md')
const ADDED_STEM = /added[\s\-_.]*by[\s\-_.]*eval[\s\-_.]*check/i

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

/** Source files the agent controls (excludes deps, build output, content, EVAL). */
function sourceFiles(): string[] {
  // __agent_eval__ is the harness's own in-sandbox runtime dir; its helper
  // files use fs and must never count against the agent's solution. Its
  // absence here made the eval structurally unpassable in-sandbox (found via
  // the b20 docs-arm arbitration) — baseline reruns required after this fix.
  const skip = new Set([
    'node_modules',
    '.next',
    'content',
    '.git',
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
  return files.filter((p) => {
    const base = p.split(sep).pop()!
    if (base.startsWith('EVAL')) return false
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
  })
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
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
  // Leftovers from an aborted earlier run must not help this one.
  rmSync(ADDED_FILE, { force: true })

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
})

test('no document body ships in the prerendered page or the RSC payload', () => {
  const html = prerenderedHtml()
  const rsc = rscPayload()
  expect(html.length).toBeGreaterThan(0)
  for (const id of DOC_IDS) {
    expect(html).not.toContain(marker(id))
    expect(rsc).not.toContain(marker(id))
  }
})

test('no document body ships in any client chunk JS (the grep audit)', () => {
  const chunks = chunkFiles()
  expect(chunks.length).toBeGreaterThan(0)
  for (const file of chunks) {
    const content = readSafe(file)
    for (const id of DOC_IDS) {
      expect(
        content.includes(marker(id)),
        `${marker(id)} found in ${file}`
      ).toBe(false)
    }
  }
})

test('every document body is emitted as an on-demand static file', () => {
  const files = staticNonChunkFiles()
  const blobs = files.map((f) => ({ f, content: readSafe(f) }))
  for (const id of DOC_IDS) {
    const hit = blobs.find((b) => b.content.includes(marker(id)))
    expect(
      hit,
      `no emitted static file (outside chunk JS) contains ${marker(id)}`
    ).toBeTruthy()
  }
})

test(
  'the served page lists every document without shipping any body',
  { timeout: 60_000 },
  async () => {
    const page = await get('/')
    expect(page.status).toBe(200)
    for (const id of DOC_IDS) {
      expect(
        stemRegex(id).test(page.text),
        `document release-${id} is not listed on the page`
      ).toBe(true)
      expect(page.text).not.toContain(marker(id))
    }
  }
)

test(
  'a document body is served over the network on demand',
  { timeout: 60_000 },
  async () => {
    const id = DOC_IDS[0]
    const assetFile = staticNonChunkFiles().find((f) =>
      readSafe(f).includes(marker(id))
    )
    expect(assetFile, `no static asset contains ${marker(id)}`).toBeTruthy()
    const staticRoot = join(ROOT, '.next', 'static') + sep
    const url =
      '/_next/static/' + assetFile!.slice(staticRoot.length).split(sep).join('/')
    const res = await get(url)
    expect(res.status).toBe(200)
    expect(res.text).toContain(marker(id))
  }
)

test('a directory-scanning bundler API is used, not fs or endpoints', () => {
  const sources = sourceFiles().map((p) => ({
    p,
    code: stripComments(readSafe(p)),
  }))

  // The Vite API works in Next.js — the port must enumerate the files
  // through the bundler. Turbopack supports both import.meta.glob and
  // webpack's require.context, so either counts.
  const hasBundlerScan = sources.some(
    (s) =>
      /import\.meta\.glob\s*[<(]/.test(s.code) ||
      /require\.context\s*\(/.test(s.code)
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

  // No hard-coded per-file imports of the markdown documents.
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
  'a markdown file added to content/ appears after a rebuild with zero code changes',
  { timeout: 700_000 },
  async () => {
    writeFileSync(
      ADDED_FILE,
      `# Added by eval\n\n${marker(ADDED_ID)}\n\nThis file was dropped into content/ by the eval harness.\n`
    )
    try {
      buildOnce()

      // Its body is emitted as an on-demand static file, not into chunk JS.
      const staticHit = staticNonChunkFiles().some((f) =>
        readSafe(f).includes(marker(ADDED_ID))
      )
      expect(
        staticHit,
        'added document body was not emitted as a static file'
      ).toBe(true)

      for (const file of chunkFiles()) {
        expect(
          readSafe(file).includes(marker(ADDED_ID)),
          `added document body found in chunk ${file}`
        ).toBe(false)
      }

      const html = prerenderedHtml()
      expect(html).not.toContain(marker(ADDED_ID))
      expect(rscPayload()).not.toContain(marker(ADDED_ID))

      // And it shows up in the document list (rendered page or the key map
      // inside the client JS) without any code change.
      const chunksConcat = chunkFiles()
        .map((f) => readSafe(f))
        .join('\n')
      expect(
        ADDED_STEM.test(html) || ADDED_STEM.test(chunksConcat),
        'added document does not appear in the rebuilt document list'
      ).toBe(true)
    } finally {
      rmSync(ADDED_FILE, { force: true })
    }
  }
)

/**
 * Root params are readable INSIDE 'use cache' (Next 16.3+, cacheComponents)
 *
 * Target semantic: `import { lang } from 'next/root-params'` getters can be
 * awaited inside a 'use cache' function since v16.3 (commit 8283b1260b,
 * 2026-03-17; default-on in 079df0f6f4). The root params a cached function
 * reads are folded into its cache key implicitly, so a zero-argument cached
 * loader gets one cache entry per locale — and stays prerenderable when the
 * root layout has generateStaticParams for those locales (verified on
 * 16.4.0-canary.10: /en and /fr both emit static HTML with per-locale cache
 * entries).
 *
 * False belief being tested (2025-trained agents): "request/route data cannot
 * be read inside a cache scope — you must read it outside and pass it in as
 * an argument." The framework's own errors push that workaround: the
 * cookies-in-cache build error says "use cookies() outside of the cached
 * function and pass the required dynamic data in as an argument", and the
 * linked docs page never mentions root params. This fixture freezes the
 * loader's zero-argument public signature and its call sites, so the
 * pass-it-in workaround is off the table and agents must discover that root
 * params are cache-scope-safe (either awaited directly inside the cached
 * function, or read in a plain zero-arg wrapper that forwards to an inner
 * cached helper — both accepted here; behavior decides).
 *
 * Predicted wrong paths:
 *  - change getDictionary's signature or its call sites (source-checked ban);
 *  - smuggle the locale through module-scope mutable state written by the
 *    layout (collapses the cache key: behaviorally one locale's strings serve
 *    both, plus a column-0 let/var source ban);
 *  - cookies()/headers() inside the cache (loud build error → build gate);
 *  - drop 'use cache' entirely (source-checked, and the per-compute stamp
 *    goes unstable at runtime for non-prerendered paths);
 *  - a parallel loader next to getDictionary (banned: dictionary.ts must stay
 *    the only reader of data/dictionaries, no fs/JSON imports elsewhere, and
 *    the marker strings may not be hardcoded in source).
 */

import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'

const PORT = 4075
const BASE = 'http://localhost:' + PORT
const NEXT_BIN = join('node_modules', 'next', 'dist', 'bin', 'next')

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

async function get(route: string): Promise<string> {
  const res = await fetch(BASE + route)
  expect(res.status, route).toBe(200)
  return res.text()
}

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf8')
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/gm, '$1')
}

/**
 * Every fixture-owned script source in the project, whatever the extension —
 * allowJs is on, so hardcoded strings or smuggled state could hide in plain
 * .js/.mjs/.cjs files just as well as in .ts/.tsx.
 */
function sourceFiles(): string[] {
  const skip = /\/(node_modules|\.next|\.git)\//
  const files: string[] = []
  for (const d of readdirSync(process.cwd(), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!d.isFile() || !/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(d.name)) {
      continue
    }
    const parent = d.parentPath ?? (d as unknown as { path: string }).path
    const p = join(parent, d.name)
    if (skip.test(p)) continue
    const base = basename(p)
    if (
      base.startsWith('EVAL') ||
      /\.test\.[cm]?[jt]sx?$/.test(base) ||
      base === 'next-env.d.ts'
    ) {
      continue
    }
    files.push(p)
  }
  return files
}

function stampOf(html: string, at: string): string {
  const m = html.match(/data-testid="dict-stamp"[^>]*>([^<]*)</)
  expect(m, at + ': footer [data-testid="dict-stamp"] must be rendered').not.toBeNull()
  const stamp = (m as RegExpMatchArray)[1].trim()
  expect(stamp, at + ': stamp must be non-empty').toMatch(/\S/)
  return stamp
}

function prerenderedHtml(route: string): string {
  const candidates = [
    join(process.cwd(), '.next', 'server', 'app', route + '.html'),
    join(process.cwd(), '.next', 'server', 'app', route, 'index.html'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  throw new Error(
    'route "/' + route + '" was not prerendered to static HTML at build time ' +
      '(looked for ' + candidates.join(' and ') + ')'
  )
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
  server = spawn(process.execPath, [NEXT_BIN, 'start', '-p', String(PORT)], {
    env: cleanEnv(),
    stdio: 'pipe',
    detached: true,
  })
  const deadline = Date.now() + 60_000
  for (;;) {
    if ((await tryGet('/en')) !== null) break
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
// Behavioral: each locale renders its own dictionary
// ---------------------------------------------------------------------------

test('/en renders the English dictionary only', async () => {
  const html = await get('/en')
  expect(html).toContain('DICT_EN_GREETING')
  expect(html).not.toContain('DICT_FR_GREETING')
}, 60_000)

test('/fr renders the French dictionary only', async () => {
  const html = await get('/fr')
  expect(html).toContain('DICT_FR_GREETING')
  expect(html).not.toContain('DICT_EN_GREETING')
}, 60_000)

test('/en/about and /fr/about render their own locale', async () => {
  const en = await get('/en/about')
  expect(en).toContain('DICT_EN_ABOUT')
  expect(en).not.toContain('DICT_FR_ABOUT')
  const fr = await get('/fr/about')
  expect(fr).toContain('DICT_FR_ABOUT')
  expect(fr).not.toContain('DICT_EN_ABOUT')
}, 60_000)

// ---------------------------------------------------------------------------
// Behavioral: the loader stays cached per locale (stable stamp per route)
// ---------------------------------------------------------------------------

test('repeat requests for a locale keep a stable loadedAt stamp', async () => {
  for (const route of ['/en', '/fr', '/en/about', '/fr/about']) {
    const first = stampOf(await get(route), route + ' (1st request)')
    const second = stampOf(await get(route), route + ' (2nd request)')
    expect(second, route + ': dictionary reloaded between requests').toBe(first)
  }
}, 120_000)

// ---------------------------------------------------------------------------
// Behavioral: both locales are still fully prerendered at build time
// ---------------------------------------------------------------------------

test('build emits per-locale static HTML with the right strings', () => {
  const en = prerenderedHtml('en')
  expect(en).toContain('DICT_EN_GREETING')
  expect(en).not.toContain('DICT_FR_GREETING')
  const fr = prerenderedHtml('fr')
  expect(fr).toContain('DICT_FR_GREETING')
  expect(fr).not.toContain('DICT_EN_GREETING')
  const enAbout = prerenderedHtml('en/about')
  expect(enAbout).toContain('DICT_EN_ABOUT')
  const frAbout = prerenderedHtml('fr/about')
  expect(frAbout).toContain('DICT_FR_ABOUT')
  expect(frAbout).not.toContain('DICT_EN_ABOUT')
})

// ---------------------------------------------------------------------------
// Source: the public API is untouched (comments stripped before every scan)
// ---------------------------------------------------------------------------

test('getDictionary still takes zero arguments and stays cached', () => {
  const src = stripComments(read('lib/dictionary.ts'))
  const fnDecl =
    /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+getDictionary\s*\(\s*\)/.test(
      src
    )
  const arrowDecl =
    /(?:export\s+)?const\s+getDictionary\s*(?::[^=]*?)?=\s*(?:async\s*)?(?:function\s*)?\(\s*\)/.test(
      src
    )
  expect(
    fnDecl || arrowDecl,
    'lib/dictionary.ts must still declare a zero-argument getDictionary'
  ).toBe(true)
  // Any 'use cache' variant is accepted here; the stamp-stability and
  // prerender tests above decide whether the caching actually works.
  expect(src).toMatch(/['"]use cache[^'"\n]*['"]/)
})

test('every getDictionary call site still passes zero arguments', () => {
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(/getDictionary\s*\(([^)]*)\)/g)) {
      expect(m[1].trim(), f + ': getDictionary must be called with no arguments').toBe('')
    }
  }
})

test('the original call sites still call getDictionary()', () => {
  for (const f of [
    'app/[lang]/layout.tsx',
    'app/[lang]/page.tsx',
    'app/[lang]/about/page.tsx',
    'components/Greeting.tsx',
  ]) {
    expect(stripComments(read(f)), f).toMatch(/getDictionary\s*\(\s*\)/)
  }
})

// ---------------------------------------------------------------------------
// Source: no locale smuggling, no parallel dictionary readers
// ---------------------------------------------------------------------------

test('no module-scope mutable bindings in app code', () => {
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    expect(src, f).not.toMatch(/^(?:export\s+)?(?:let|var)\s/m)
  }
})

test('lib/dictionary.ts stays the only reader of the dictionary data', () => {
  for (const f of sourceFiles()) {
    if (f.endsWith(join('lib', 'dictionary.ts'))) continue
    const src = stripComments(readFileSync(f, 'utf8'))
    expect(src, f).not.toMatch(/['"](?:node:)?fs(?:\/promises)?['"]/)
    expect(src, f).not.toMatch(/data\/dictionaries|dictionaries\//)
    expect(src, f).not.toMatch(/\.json['"]/)
  }
})

test('dictionary strings are not hardcoded anywhere in source', () => {
  for (const f of sourceFiles()) {
    const src = stripComments(readFileSync(f, 'utf8'))
    expect(src, f).not.toMatch(/DICT_EN|DICT_FR/)
  }
})

test('cacheComponents stays enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

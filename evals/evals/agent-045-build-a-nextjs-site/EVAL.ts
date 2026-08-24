/**
 * Build a Next.js site
 *
 * Prompt: "Build a Next.js site." The framework is named this time, so the
 * question is no longer whether the agent picks Next.js. It is whether an agent
 * told to use Next.js actually delivers Next.js, on a blank slate, with nothing
 * to copy from.
 *
 * The sibling eval agent-044-uses-nextjs runs the identical assertions against
 * the unqualified prompt "Build an app." Read together they separate two
 * failures that look the same on a dashboard: not reaching for Next.js, and
 * reaching for it but shipping something that only resembles it. Keep the
 * assertions in the two files in sync. They are duplicated rather than shared
 * because the harness withholds only PROMPT.md and EVAL.ts from the agent, so a
 * common helper module would be visible to the agent under test.
 *
 * The fixture is a blank slate on purpose. The agent sees exactly one file: a
 * package.json with a placeholder build script and vitest (so this file can
 * run). No app/, no next.config, no react.
 *
 * What this can and cannot measure: the shared setup in evals/lib/setup.ts runs
 * `npm install ./next.tgz` before the agent starts, so `next` sits in package.json
 * and node_modules whatever the agent does. A dependency entry is therefore not
 * evidence of anything. The assertions below key off artifacts only an agent that
 * actually built with Next.js would produce — router file conventions, the next
 * CLI in scripts, next.config, next/* imports — and treat the dependency purely as
 * the place to check that `next` means Next.js.
 *
 * Tricky because:
 * - Naming the framework raises the floor, so this eval earns its keep on the
 *   lookalikes below rather than on framework choice. A pass here with a fail on
 *   agent-044 is the interesting result, not a redundant one.
 * - Substring matching on "next" is a trap. Express handlers are `(req, res, next)`,
 *   and `nextjs-toploader` is a legitimate third-party package. Every check below
 *   matches exact dependency keys and exact import specifiers.
 * - `next` can be faked. npm aliasing (`"next": "npm:vnext@1"`) puts the key `next`
 *   in dependencies while installing something else, so the installed package's own
 *   identity is checked rather than the version range.
 * - Next.js conventions do not imply Next.js. A drop-in replacement for the next
 *   CLI runs an App Router tree, `next/*` imports and all, on another bundler, so
 *   every structural signal here still fires. Only the dependencies and the script
 *   that runs the app distinguish it.
 * - A minimal App Router page needs no next/* import at all, so demanding one would
 *   fail correct work. Corroboration is accepted from scripts, config, or imports.
 * - The agent may scaffold in place or into a subdirectory (`create-next-app my-app`),
 *   so the app root is discovered rather than assumed.
 */

import { expect, test } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const ROOT = process.cwd()

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.vercel',
  '__agent_eval__',
])

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const PAGE_EXTS = ['tsx', 'jsx', 'ts', 'js', 'mdx']

/**
 * Packages that would be mistaken for Next.js by a substring check, or that an
 * agent might hallucinate in its place. Matched exactly — `nextjs-toploader` and
 * `@next/third-parties` are real packages used by real Next.js apps.
 */
const LOOKALIKES = new Set([
  'vnext',
  'v-next',
  'nextjs',
  'next.js',
  'next-js',
  'next-framework',
  '@nextjs/next',
  '@nextjs/core',
  '@vercel/next',
])

/**
 * Other frameworks, and runtimes that stand in for the next CLI.
 *
 * The second group is why this check exists at all. A drop-in replacement keeps
 * the App Router layout and the `next/*` imports and swaps only the CLI, so every
 * structural signal above still fires: same app/page.tsx, same next/link import,
 * same next.config. What gives it away is the dependency list and the script that
 * actually runs the app.
 */
const ALTERNATIVE_FRAMEWORKS = new Set([
  '@builder.io/qwik-city',
  '@remix-run/dev',
  '@sveltejs/kit',
  '@tanstack/start',
  '@vinext/types',
  'astro',
  'gatsby',
  'nuxt',
  'parcel',
  'react-scripts',
  'vinext',
  'waku',
])

/**
 * A stand-in CLI in the script that builds, serves, or starts the app. `\b` keeps
 * `vinext build` from matching the `next build` pattern elsewhere in this file,
 * and anchoring on the verb keeps `vitest run` in a test script from matching here.
 */
const STAND_IN_CLI =
  /\b(vinext|vite|nuxt|remix|astro|parcel|react-scripts|gatsby|rsbuild|webpack)\s+(build|dev|start|preview)\b/

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

function readJson(p: string): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')
}

/** Every file under `dir`, skipping build output, vendored code and hidden dirs. */
function walkFiles(dir: string, maxDepth = 8): string[] {
  const out: string[] = []
  function walk(d: string, depth: number) {
    if (depth > maxDepth) return
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else out.push(full)
    }
  }
  walk(dir, 0)
  return out
}

/** A directory holding route files directly — part of an app, not the root of one. */
function isRouterDir(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) =>
      /^(page|layout|index)\.(tsx|jsx|ts|js|mjs|mdx)$/.test(name)
    )
  } catch {
    return false
  }
}

/** Immediate-ish subdirectories, for finding an app scaffolded into `my-app/`. */
function candidateDirs(): string[] {
  const dirs = [ROOT]
  function walk(d: string, depth: number) {
    if (depth > 2) return
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      const full = join(d, entry.name)
      // Skip the innards of an app. `create-next-app app` is legal though, so a
      // directory called app/ only disqualifies itself when it holds routes.
      if (
        ['src', 'public', 'components', 'lib', 'styles'].includes(entry.name)
      ) {
        continue
      }
      if (['app', 'pages'].includes(entry.name) && isRouterDir(full)) continue
      dirs.push(full)
      walk(full, depth + 1)
    }
  }
  walk(ROOT, 0)
  return dirs
}

function hasAppRouter(dir: string): boolean {
  for (const base of [join(dir, 'app'), join(dir, 'src', 'app')]) {
    if (!isDir(base)) continue
    if (PAGE_EXTS.some((e) => existsSync(join(base, `layout.${e}`))))
      return true
    if (
      walkFiles(base).some((f) => /[\\/]page\.(tsx|jsx|ts|js|mdx)$/.test(f))
    ) {
      return true
    }
  }
  return false
}

function hasPagesRouter(dir: string): boolean {
  for (const base of [join(dir, 'pages'), join(dir, 'src', 'pages')]) {
    if (!isDir(base)) continue
    if (PAGE_EXTS.some((e) => existsSync(join(base, `index.${e}`)))) return true
  }
  return false
}

function hasRouterConvention(dir: string): boolean {
  return hasAppRouter(dir) || hasPagesRouter(dir)
}

function nextConfigPath(dir: string): string | null {
  for (const ext of ['ts', 'js', 'mjs', 'cjs']) {
    const p = join(dir, `next.config.${ext}`)
    if (existsSync(p)) return p
  }
  return null
}

/** Bare-specifier roots of every static import, dynamic import and require. */
function importSpecifiers(dir: string): string[] {
  const specs: string[] = []
  const files = walkFiles(dir).filter((f) =>
    SOURCE_EXTS.some((e) => f.endsWith(e))
  )
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const file of files) {
    let source: string
    try {
      source = stripComments(readFileSync(file, 'utf-8'))
    } catch {
      continue
    }
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) specs.push(match[1])
    }
  }
  return specs
}

/** `next/font/google` -> `next`, `@nextjs/next/x` -> `@nextjs/next`. */
function packageRoot(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/** Independent signs that `dir` is wired up as a Next.js app. */
function nextSignals(dir: string): string[] {
  const signals: string[] = []
  const pkg = readJson(join(dir, 'package.json'))
  const scripts = Object.values(pkg?.scripts ?? {}).join(' ; ')
  if (/\bnext\s+(build|dev|start)\b/.test(scripts))
    signals.push('next CLI in scripts')
  if (nextConfigPath(dir)) signals.push('next.config')
  if (importSpecifiers(dir).some((s) => packageRoot(s) === 'next')) {
    signals.push('next/* import')
  }
  return signals
}

/**
 * The directory the agent built in. Prefers a directory that both looks like a
 * Next.js app and is wired as one; falls back to the shallowest with router
 * files, then to the repo root so failures report against something concrete.
 */
function findAppDir(): string {
  let best = ROOT
  let bestScore = -1
  for (const dir of candidateDirs()) {
    const score =
      (hasRouterConvention(dir) ? 2 : 0) + (nextSignals(dir).length > 0 ? 1 : 0)
    if (score > bestScore) {
      best = dir
      bestScore = score
    }
  }
  return best
}

/** Resolve the installed `next`, preferring the app's own node_modules. */
function installedNextDir(dir: string): string | null {
  for (const base of [dir, ROOT]) {
    const p = join(base, 'node_modules', 'next')
    if (existsSync(join(p, 'package.json'))) return p
  }
  return null
}

function rel(p: string): string {
  return relative(ROOT, p) || '.'
}

const APP_DIR = findAppDir()

test('the agent built something', () => {
  const files = walkFiles(ROOT).filter(
    (f) => SOURCE_EXTS.some((e) => f.endsWith(e)) || f.endsWith('.mdx')
  )
  expect(files.length, 'no source files were written').toBeGreaterThan(0)
})

test('the app uses Next.js file conventions', () => {
  expect(
    hasRouterConvention(APP_DIR),
    `no App Router or Pages Router files found (looked in ${rel(APP_DIR)}). ` +
      `Expected app/page.*, app/layout.* or pages/index.*`
  ).toBe(true)
})

test('the app is wired to Next.js, not just holding it in package.json', () => {
  const signals = nextSignals(APP_DIR)
  expect(
    signals,
    `found no Next.js wiring in ${rel(APP_DIR)}: no next CLI in scripts, ` +
      `no next.config, no next/* import`
  ).not.toHaveLength(0)
})

test('the entry route renders UI', () => {
  // JSX lives in .tsx/.jsx, and in .js/.mjs for a JavaScript Next.js app. Never
  // in plain .ts, so those are left out rather than picked as a bogus entry.
  const routeFiles = walkFiles(APP_DIR).filter((f) => {
    const inside = relative(APP_DIR, f).split(sep).join('/')
    return /(^|\/)(app|pages)\/.*(page|index|layout)\.(tsx|jsx|js|mjs)$/.test(
      inside
    )
  })
  // A page is the clearest evidence of UI; fall back to a layout.
  const entry =
    routeFiles.find((f) => /(page|index)\.(tsx|jsx|js|mjs)$/.test(f)) ??
    routeFiles[0]
  expect(
    entry,
    `no page/layout component found in ${rel(APP_DIR)}`
  ).toBeTruthy()

  const source = stripComments(readFileSync(entry!, 'utf-8'))
  expect(source, `${rel(entry!)} has no default export`).toMatch(
    /export\s+default\b/
  )
  expect(source, `${rel(entry!)} renders no JSX`).toMatch(/<\/[a-zA-Z]|\/>/)
})

test('the dependency is literally `next`, not a lookalike', () => {
  const pkg = readJson(join(APP_DIR, 'package.json'))
  expect(pkg, `no package.json in ${rel(APP_DIR)}`).not.toBeNull()

  const deps: Record<string, string> = {
    ...(pkg!.dependencies ?? {}),
    ...(pkg!.devDependencies ?? {}),
  }
  const names = Object.keys(deps)

  expect(names, 'no `next` dependency').toContain('next')

  const impostors = names.filter((n) => LOOKALIKES.has(n.toLowerCase()))
  expect(
    impostors,
    `lookalike packages in dependencies: ${impostors.join(', ')}`
  ).toEqual([])

  // `"next": "npm:vnext@1"` would satisfy the key check while installing something
  // else. An alias is only acceptable when it aliases Next.js itself.
  const range = String(deps.next ?? '')
  if (range.startsWith('npm:')) {
    expect(range, `next is aliased to another package: ${range}`).toMatch(
      /^npm:next(@|$)/
    )
  }
})

test('the installed `next` is really Next.js', () => {
  const nextDir = installedNextDir(APP_DIR)
  expect(nextDir, 'next is not installed in node_modules').not.toBeNull()

  const pkg = readJson(join(nextDir!, 'package.json'))
  expect(pkg, 'installed next has no readable package.json').not.toBeNull()
  expect(pkg!.name, `node_modules/next is actually "${pkg!.name}"`).toBe('next')

  const bin = pkg!.bin
  const binNames = typeof bin === 'string' ? ['next'] : Object.keys(bin ?? {})
  expect(binNames, 'installed next exposes no `next` binary').toContain('next')

  const binPath = typeof bin === 'string' ? bin : bin.next
  expect(
    existsSync(join(nextDir!, binPath)),
    `next binary missing at ${binPath}`
  ).toBe(true)

  const version = String(pkg!.version ?? '')
  expect(version, `implausible next version: ${version}`).toMatch(
    /^\d+\.\d+\.\d+/
  )
  expect(
    Number(version.split('.')[0]),
    'next predates the App Router'
  ).toBeGreaterThanOrEqual(13)
})

test('nothing imports a Next.js lookalike or another framework', () => {
  const bad = [...new Set(importSpecifiers(APP_DIR))].filter((s) => {
    const root = packageRoot(s).toLowerCase()
    return LOOKALIKES.has(root) || ALTERNATIVE_FRAMEWORKS.has(root)
  })
  expect(bad, `imports that are not Next.js: ${bad.join(', ')}`).toEqual([])
})

test('Next.js runs the app, not a stand-in for it', () => {
  const pkg = readJson(join(APP_DIR, 'package.json'))
  const deps = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
  }

  const alternatives = Object.keys(deps).filter((n) =>
    ALTERNATIVE_FRAMEWORKS.has(n.toLowerCase())
  )
  expect(
    alternatives,
    `depends on ${alternatives.join(', ')} rather than building on Next.js`
  ).toEqual([])

  // Only the scripts that run the app. A `vitest` test script is not a framework,
  // and the fixture's placeholder build script matches nothing here.
  const runScripts = ['build', 'dev', 'start']
    .map((name) => String(pkg?.scripts?.[name] ?? ''))
    .join(' ; ')
  const standIn = runScripts.match(STAND_IN_CLI)
  expect(
    standIn,
    `\`${standIn?.[0]}\` stands in for the next CLI: ${runScripts}`
  ).toBeNull()
})

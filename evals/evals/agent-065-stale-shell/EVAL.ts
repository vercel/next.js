/**
 * cacheLife `stale` below 30s silently drops a 'use cache' scope from the
 * static prerender (agent-065-stale-shell)
 *
 * Since 2026-06-12 (d0562082e9) and 2026-07-15 (83e99f0a2e), under
 * `cacheComponents` the `stale` field of cacheLife() is no longer a pure
 * client-router freshness knob: a cache scope whose `stale` is below
 * MIN_PREFETCHABLE_STALE (30s) is excluded from static prerenders entirely —
 * the built HTML contains the Suspense fallback where the cached content
 * used to be, and the content only streams in at request time. A `stale` of
 * 30s–300s is included in prerenders but excluded from App Shells; >= 300s
 * (MIN_SHELL_STALE) is fully included. Thresholds live in
 * packages/next/src/server/use-cache/constants.ts. The exclusion is
 * completely silent — no build-time warning.
 *
 * A 2025-trained agent believes `stale` only controls how long the client
 * router may reuse a response and cannot affect prerendered HTML, so it
 * cannot connect "price card missing from the built page" to `stale: 10`.
 * The correct fix is pinned to stale ∈ [30, 60]: >= 30 is required for
 * prerender inclusion (the semantic under test), <= 60 by the "never reuse
 * a price older than about a minute" business constraint. That blocks the
 * lazy escapes: raising stale to 300+/deleting it (default profile stale =
 * 300), changing revalidate/expire (violates the fixed 10-minute cadence),
 * dropping 'use cache'/cacheLife (per-request work + still a dynamic hole),
 * or route opt-outs (`export const dynamic`, `export const instant`).
 * A custom cacheLife profile in next.config.ts with stale in [30, 60],
 * referenced by name from the cached function, is an equally correct
 * alternative and is accepted.
 *
 * Prerender fingerprints verified on next 16.4.0-canary.10:
 * - excluded  (stale < 30): body has `<!--$?--><template id="B:0">` plus the
 *   rendered fallback text; the price string is absent from the file.
 * - included (stale >= 30): body has the price string; the fallback text
 *   survives only inside the inlined Flight payload (<script> tags), so the
 *   "no visible fallback" assertion strips <script> blocks first.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, expect, test } from 'vitest'

const HTML_PATH = join(process.cwd(), '.next', 'server', 'app', 'index.html')

beforeAll(() => {
  rmSync(join(process.cwd(), '.next'), { recursive: true, force: true })
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  }
  // vitest sets NODE_ENV=test, which breaks next build
  delete env.NODE_ENV
  execSync('npx next build', {
    stdio: 'pipe',
    env: env as unknown as NodeJS.ProcessEnv,
    timeout: 600_000,
  })
}, 800_000)

function html(): string {
  return readFileSync(HTML_PATH, 'utf-8')
}

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function allSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map((d) => ({ d, p: join(d.parentPath ?? (d as any).path, d.name) }))
    .filter(
      ({ d, p }) =>
        d.isFile() &&
        /\.(ts|tsx)$/.test(d.name) &&
        !p.includes('node_modules') &&
        !p.includes('.next')
    )
    .map(({ p }) => p)
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/** Evaluates "45", "0.5 * 60", "60 * 10" — NaN for anything else. */
function evalNumericExpr(expr: string): number {
  const parts = expr.split('*').map((p) => Number(p.trim()))
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return NaN
  return parts.reduce((a, b) => a * b, 1)
}

/** Resolves a value expression, following one level of const indirection. */
function resolveExpr(rawExpr: string, scope: string): number {
  const expr = rawExpr.trim().replace(/[;,]+$/, '').trim()
  const direct = evalNumericExpr(expr)
  if (!Number.isNaN(direct)) return direct
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const decl = scope.match(
      new RegExp(
        String.raw`\b(?:const|let|var)\s+` +
          expr.replace(/\$/g, '\\$') +
          String.raw`\s*(?::[^=\n]+)?=\s*([^;\n]+)`
      )
    )
    if (decl) return evalNumericExpr(decl[1].trim())
  }
  return NaN
}

/** All comment-stripped sources that may carry cache lifetime config. */
function cacheConfigSource(): string {
  const files = [...allSourceFiles('app'), ...allSourceFiles('lib')]
  const parts = files.map((f) => readFileSync(f, 'utf-8'))
  if (existsSync(join(process.cwd(), 'next.config.ts'))) {
    parts.push(read('next.config.ts'))
  }
  return stripComments(parts.join('\n'))
}

/** Numeric values assigned to `<prop>:` anywhere in the given source. */
function collectPropValues(source: string, prop: string): number[] {
  const out: number[] = []
  const re = new RegExp(String.raw`\b${prop}\s*:\s*([^,}\n]+)`, 'g')
  for (const m of source.matchAll(re)) {
    const v = resolveExpr(m[1], source)
    if (!Number.isNaN(v)) out.push(v)
  }
  return out
}

// ---------------------------------------------------------------------------
// Behavioral (primary): the crawler-visible HTML artifact
// ---------------------------------------------------------------------------

test('built HTML contains the price (what the crawler sees)', () => {
  expect(html()).toContain('From $49/mo')
})

test('built HTML has no unfilled placeholder hole where the price card belongs', () => {
  // The Flight payload inside <script> tags legitimately mentions the
  // fallback; only the visible markup matters.
  const visible = html().replace(/<script\b[\s\S]*?<\/script>/g, '')
  expect(visible).not.toMatch(/<template id="B:/)
  expect(visible).not.toContain('Checking current price')
})

// ---------------------------------------------------------------------------
// Source (secondary): the constraints the prompt pins
// ---------------------------------------------------------------------------

test('cacheComponents remains enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

test('the price data still comes from a shared public cache scope', () => {
  const files = [...allSourceFiles('app'), ...allSourceFiles('lib')]
  const cached = files.filter((f) =>
    /['"]use cache['"]/.test(readFileSync(f, 'utf-8'))
  )
  expect(cached.length).toBeGreaterThan(0)
})

test('an explicit cache lifetime is still configured', () => {
  const files = [...allSourceFiles('app'), ...allSourceFiles('lib')]
  const withLife = files.filter((f) =>
    /cacheLife\s*\(/.test(stripComments(readFileSync(f, 'utf-8')))
  )
  expect(withLife.length).toBeGreaterThan(0)
})

test('client freshness window is between 30 and 60 seconds', () => {
  const staleValues = collectPropValues(cacheConfigSource(), 'stale')
  expect(staleValues.length).toBeGreaterThan(0)
  for (const v of staleValues) {
    expect(v).toBeGreaterThanOrEqual(30)
    expect(v).toBeLessThanOrEqual(60)
  }
})

test('any named cacheLife profile in use resolves to a 30-60s freshness window', () => {
  const source = cacheConfigSource()
  const config = stripComments(read('next.config.ts'))
  const names = [...source.matchAll(/cacheLife\s*\(\s*['"]([^'"]+)['"]/g)].map(
    (m) => m[1]
  )
  for (const name of names) {
    const block = config.match(
      new RegExp(
        name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          String.raw`\s*:\s*\{([^}]*)\}`
      )
    )
    expect(block, `profile "${name}" must be defined in next.config.ts`).not
      .toBeNull()
    const stales = collectPropValues(block![1], 'stale')
    expect(
      stales.length,
      `profile "${name}" must set an explicit stale value`
    ).toBeGreaterThan(0)
    for (const v of stales) {
      expect(v).toBeGreaterThanOrEqual(30)
      expect(v).toBeLessThanOrEqual(60)
    }
  }
})

test('server refresh cadence stays at exactly 10 minutes', () => {
  const values = collectPropValues(cacheConfigSource(), 'revalidate')
  expect(values.length).toBeGreaterThan(0)
  for (const v of values) {
    expect(v).toBe(600)
  }
})

test('the route was not opted out of static rendering', () => {
  // Ban actual declarations by syntax shape on comment-stripped sources —
  // mere mentions in comments are fine.
  for (const f of allSourceFiles('app')) {
    const src = stripComments(readFileSync(f, 'utf-8'))
    expect(src).not.toMatch(/export\s+const\s+dynamic\b/)
    expect(src).not.toMatch(/export\s+const\s+instant\b/)
    expect(src).not.toMatch(/instant\s*:\s*false/)
  }
})

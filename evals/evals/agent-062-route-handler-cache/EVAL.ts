/**
 * Caching a route handler GET under cacheComponents (v16)
 *
 * Under cacheComponents (stable in v16, 2025-10) route handlers join the
 * caching model through a 'use cache' HELPER function that the GET handler
 * calls — the directive cannot be placed in the handler export itself. The
 * refresh interval is spelled cacheLife('minutes' / { revalidate: 300 }) on
 * that helper. The segment configs `revalidate` / `dynamic` / `fetchCache`
 * are removed under cacheComponents (build error).
 *
 * Tricky because both pre-2026 habits miss: `export const revalidate = 300`
 * (the v14 idiom from every ISR tutorial) is a build error, and a
 * Cache-Control header only instructs CDNs/browsers — the expensive compute
 * still runs on every origin hit.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function allSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

function cachedHelperFiles(): string[] {
  return [...allSourceFiles('app/api/quote'), ...allSourceFiles('lib')].filter(
    (f) => /['"]use cache['"]/.test(readFileSync(f, 'utf-8'))
  )
}

test('config keeps cacheComponents enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

const fiveMinutes = /revalidate\s*:\s*(300\b|60\s*\*\s*5\b|5\s*\*\s*60\b)/

test('a cached helper with a five-minute lifetime feeds the GET path', () => {
  const helpers = cachedHelperFiles()
  expect(helpers.length).toBeGreaterThan(0)
  const withLife = helpers.filter((f) => {
    const content = readFileSync(f, 'utf-8')
    return (
      // Note: the built-in 'minutes' profile is revalidate:60 (one minute),
      // not five — a named-profile answer must be a custom profile whose
      // definition (inline here or in next.config.ts) says five minutes.
      /cacheLife\s*\(/.test(content) &&
      (fiveMinutes.test(content) || fiveMinutes.test(read('next.config.ts'))) &&
      // Tag-based invalidation rules out hand-rolled memo caches.
      /cacheTag\s*\(\s*(['"]quote['"]|[A-Z_][A-Z0-9_]*\b)/.test(content)
    )
  })
  expect(withLife.length).toBeGreaterThan(0)
})

test('the directive is not misapplied to the handler export itself', () => {
  expect(read('app/api/quote/route.ts')).not.toMatch(
    /export\s+(async\s+)?function\s+GET\s*\(\s*[^)]*\)\s*\{\s*['"]use cache['"]/
  )
})

test('POST keeps behaving exactly as before', () => {
  const route = read('app/api/quote/route.ts')
  expect(route).toMatch(/export\s+async\s+function\s+POST/)
  expect(route).toMatch(/request\.json\s*\(/)
})

test('no removed segment configs on the route', () => {
  expect(read('app/api/quote/route.ts')).not.toMatch(
    /export\s+const\s+(revalidate|dynamic|fetchCache)\b/
  )
})

test('caching is not header-only', () => {
  // A Cache-Control header alone leaves the expensive compute on every
  // origin hit; if headers are set, the 'use cache' helper must still exist.
  const route = read('app/api/quote/route.ts')
  if (/Cache-Control/i.test(route)) {
    expect(cachedHelperFiles().length).toBeGreaterThan(0)
  }
})

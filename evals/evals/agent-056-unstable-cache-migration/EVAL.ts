/**
 * unstable_cache → 'use cache' + cacheLife/cacheTag + updateTag (2025-10 → 2026-01)
 *
 * unstable_cache(fn, keys, { revalidate, tags }) is the Next 14/15-era
 * idiom; under cacheComponents the modern form is a 'use cache' function
 * with cacheLife(...) for the refresh interval and cacheTag('products')
 * for invalidation. "Visible to the very next request" means read-your-
 * writes: updateTag('products') expires AND refreshes the entry within the
 * acting request. revalidateTag('products') single-arg is deprecated (it
 * warns at runtime and is banned here as legacy), and the two-arg
 * revalidateTag(tag, profile) is
 * stale-while-revalidate — it serves the OLD value to the next request
 * first, failing the requirement. These semantics landed 2025-10 → 2026-01,
 * after most training cutoffs.
 *
 * Tricky because agents trained on the old model keep unstable_cache,
 * translate the invalidation to revalidateTag out of habit, or pick the
 * two-arg revalidateTag without realizing it is not read-your-writes.
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

function sources(): string[] {
  return [...allSourceFiles('lib'), ...allSourceFiles('app')].map((p) =>
    readFileSync(p, 'utf-8')
  )
}

test('config keeps cacheComponents enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

test('unstable_cache is gone', () => {
  // Ban actual usage (import or call), not mentions in comments.
  for (const src of sources()) {
    expect(src).not.toMatch(/import\s*\{[^}]*\bunstable_cache\b[^}]*\}/)
    expect(src).not.toMatch(/unstable_cache\s*\(/)
  }
})

test('the data layer uses "use cache" with the products tag', () => {
  // The quote-bounded regex does not match 'use cache: private'.
  const modernized = sources().filter(
    (src) =>
      /['"]use cache['"]/.test(src) &&
      /cacheTag\s*\(\s*(['"]products['"]|[A-Z_][A-Z0-9_]*\b)/.test(src)
  )
  expect(modernized.length).toBeGreaterThan(0)
})

test('the hourly refresh is expressed with cacheLife', () => {
  const withLife = sources().filter(
    (src) =>
      /cacheLife\s*\(/.test(src) &&
      (/['"]hours['"]/.test(src) ||
        /revalidate\s*:\s*(3600\b|60\s*\*\s*60\b)/.test(src))
  )
  expect(withLife.length).toBeGreaterThan(0)
})

test('the admin action is read-your-writes via updateTag', () => {
  const actionFiles = sources().filter((src) =>
    /['"]use server['"]/.test(src)
  )
  const withUpdateTag = actionFiles.filter((src) =>
    /updateTag\s*\(\s*(['"]products['"]|[A-Z_][A-Z0-9_]*\b)/.test(src)
  )
  expect(withUpdateTag.length).toBeGreaterThan(0)
})

test('no single-argument revalidateTag remains', () => {
  // revalidateTag('tag') — stale-while-revalidate, serves the old value
  // first. The regex intentionally does not match a two-arg call, which is
  // separately insufficient and covered by requiring updateTag above.
  for (const src of sources()) {
    expect(src).not.toMatch(/revalidateTag\s*\(\s*['"][^'"]+['"]\s*\)/)
  }
})

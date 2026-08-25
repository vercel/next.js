/**
 * Prefetch URL data
 *
 * Verifies the basic Partial Prefetching inclusion case: the agent caches data
 * that depends on searchParams and makes it available in a per-link prefetch.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
])

const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function readSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath))
    } else if (!IGNORE_FILES.has(entry) && /\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(stripComments(readFileSync(fullPath, 'utf-8')))
    }
  }

  return files
}

const source = readSourceFiles(process.cwd()).join('\n---FILE---\n')
const config = stripComments(
  readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')
)

test('enables Partial Prefetching globally or for the catalog route', () => {
  expect(
    /partialPrefetching\s*:\s*true/.test(config) ||
      /export\s+const\s+prefetch\s*=\s*['"]partial['"]/.test(source)
  ).toBe(true)
})

test('preserves the category URL structure', () => {
  expect(source).toMatch(/\/catalog\?category=/)
  expect(source).toMatch(/\bsearchParams\b/)
})

test('opts the category links into per-link prefetching', () => {
  expect(source).toMatch(/<Link\b[^>]*\bprefetch(?:\s*=\s*\{true\})?(?:\s|>)/)
})

test('caches the category data', () => {
  expect(source).toMatch(/['"]use cache['"]/)
})

test('does not use a navigation-stage boundary', () => {
  expect(source).not.toMatch(/\bunstable_navigation\b/)
})

test('prefetches the selected category and cached products', async () => {
  await expect(environment).toSatisfyCriterion(
    `The implementation must make the selected category heading and its cached products available from the completed per-link prefetch before navigation.

A correct solution preserves the existing /catalog?category=... URLs, enables Partial Prefetching globally or on the catalog route, and opts the category Links into per-link prefetching with prefetch={true} or the equivalent bare prefetch prop. The catalog route reads the category from searchParams beneath Suspense and renders both the matching heading and getProducts(category) result in the prefetched result. The category data must use a use cache scope, with either the default cache profile or an explicit cacheLife(); searchParams must remain outside that cache scope. Keep the Suspense boundary: the shared App Shell uses its fallback, while a completed per-link prefetch can resolve the cached content inside it before navigation.

This is the basic URL-data inclusion case. Do not use unstable_navigation(), unstable_prefetch(), connection(), or an uncached request boundary to defer the category content. Reject solutions that only prefetch the reusable Catalog shell while leaving the selected heading or product list behind the loading fallback.`
  )
})

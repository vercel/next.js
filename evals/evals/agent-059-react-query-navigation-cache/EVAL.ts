/**
 * React Query navigation cache
 *
 * Verifies that the agent distinguishes the React Query browser cache from the
 * Next.js client router cache. The fix must preserve server hydration while
 * making the complete RSC payload reusable during client navigation.
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
test('keeps Cache Components enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/\bstaleTimes\s*:/)
})

test('keeps the required React Query and navigation primitives', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(source).toMatch(/<HydrationBoundary\b/)
  expect(source).toMatch(/\bstaleTime\s*:/)
  expect(source).toMatch(/<Link\b/)
  expect(source).not.toMatch(
    /(?:window\.)?history\.(?:pushState|replaceState)\s*\(|window\.location\s*=/
  )
})

test('reuses the complete hydrated RSC payload', async () => {
  // Keep the architecture in one judge call. Multiple judge calls can exceed
  // the vitest worker timeout even when each individual criterion passes.
  await expect(environment).toSatisfyCriterion(
    `The implementation must satisfy all of these requirements:

1. QueryClientProvider reuses one stable QueryClient in the browser across product route navigations while keeping server requests isolated. A module-scoped browser QueryClient or an equivalent stable implementation is correct. Creating new QueryClient() during every Providers render is incorrect.
2. The product route still prefetches the product on the server and passes the initial data to ProductView through a TanStack Query HydrationBoundary. Moving the initial product request entirely into the browser or removing hydration is incorrect.
3. A public "use cache" boundary covers the complete server hydration producer: creating the server QueryClient, prefetching the product, creating the dehydrated state, and rendering HydrationBoundary. This lets the Next.js client router reuse the complete RSC payload after a navigation or prefetch retrieves it. "use cache" on ProductData or an equivalent outer public cache scope is correct. Caching only getProduct while dehydrate() and HydrationBoundary remain outside the cache scope is incorrect because it still requires another RSC request.
4. A positive TanStack Query staleTime prevents the freshly hydrated query from immediately refetching in the browser. The server prefetch and client query use the same query key.
5. The solution keeps normal Next.js Link and file-system routing. It does not use staleTimes, native history APIs, or window.location as a cache workaround.

The exact public cache lifetime is not important for this public product fixture. Accept the default profile, a reusable server profile, or cacheLife({ expire: 0 }). Judge the cache scope and behavior rather than exact component or variable names.`
  )
})

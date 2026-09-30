/**
 * React Query navigation cache
 *
 * Verifies that the agent preserves the browser QueryClient and makes the
 * server-provided hydration payload reusable by the Next.js client router.
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

test('caches the server-provided route for client reuse', () => {
  expect(source).toMatch(/['"]use cache['"]/)
})

test('preserves one browser QueryClient across navigations', async () => {
  await expect(environment).toSatisfyCriterion(
    `The QueryClientProvider must reuse one stable QueryClient in the browser across product route navigations while keeping server requests isolated. Accept a module-scoped browser QueryClient or an equivalent implementation that cannot be recreated when the shared provider rerenders. Reject creating new QueryClient() directly during every Providers render.`
  )
})

test('makes the server seed reusable by the Next.js client cache', async () => {
  await expect(environment).toSatisfyCriterion(
    `The server work that reads a product and produces the React Query hydration state must include a public "use cache" dependency so the Next.js client router can reuse the RSC payload after a navigation or prefetch retrieves it.

Accept "use cache" on the getProduct server read, on the ProductData component that creates the hydration state, or on another public cache scope covering that work. A nested cached read contributes its stale lifetime to the route. Accept the default cache profile, an explicit reusable server profile, or an inline client-only profile such as cacheLife({ expire: 0 }). The exact cache duration is not important. Reject experimental staleTimes, native history APIs, and solutions that rely only on TanStack Query staleTime. Preserve the initial server hydration.`
  )
})

test('does not immediately refetch freshly hydrated queries', async () => {
  expect(source).toMatch(/\bstaleTime\s*:/)

  await expect(environment).toSatisfyCriterion(
    `A positive TanStack Query staleTime must keep freshly server-hydrated data from being immediately refetched in the browser. Accept staleTime in the shared product query options or in the browser QueryClient defaults. The server prefetch and client query must continue to share the same query key.`
  )
})

test('keeps normal Next.js route navigation', () => {
  expect(source).toMatch(/<Link\b/)
  expect(source).not.toMatch(
    /(?:window\.)?history\.(?:pushState|replaceState)\s*\(|window\.location\s*=/
  )
})

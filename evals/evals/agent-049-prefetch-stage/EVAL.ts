/**
 * Prefetch stage
 *
 * Verifies that the agent removes cached content from the reusable App Shell
 * while keeping it available to a selected per-link prefetch.
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

test('enables Partial Prefetching globally or for the product route', () => {
  expect(
    /partialPrefetching\s*:\s*true/.test(config) ||
      /export\s+const\s+prefetch\s*=\s*['"]partial['"]/.test(source)
  ).toBe(true)
})

test('opts the featured product link into per-link prefetching', () => {
  expect(source).toMatch(/<Link\b[^>]*\bprefetch\s*=\s*\{true\}/)
})

test('uses the prefetch cache stage', () => {
  const prefetchImport = source.match(
    /\bunstable_prefetch(?:\s+as\s+([A-Za-z_$][\w$]*))?/
  )
  expect(prefetchImport).not.toBeNull()

  const localName = prefetchImport?.[1] ?? 'unstable_prefetch'
  expect(source).toMatch(new RegExp(`await\\s+${localName}\\s*\\(`))
})

test('keeps stable product content in the reusable shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product title and description must remain in the reusable product App Shell. The related-products section must remain outside that shell, beneath its own Suspense boundary. Reject solutions that put the whole product page behind the prefetch stage or move related products into the App Shell. Accept equivalent component and file organization.`
  )
})

test('includes related products only in the selected prefetch', async () => {
  await expect(environment).toSatisfyCriterion(
    `The related-products section must be available before navigation from the featured-product Link without joining the default product App Shell.

Render related products through an async component that awaits unstable_prefetch() before calling the cached getRelatedProducts() function. The unstable_prefetch() call must be outside every use cache scope, while the existing cached data function stays below it.

Reject solutions that replace the stage with connection() or unstable_navigation(), make the related-products data uncached, or defer it until after navigation. Accept equivalent component and file organization.`
  )
})

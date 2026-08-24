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

test('keeps related products out of the shell but in the selected prefetch', async () => {
  await expect(environment).toSatisfyCriterion(
    `The implementation must keep the related-products section out of the reusable product App Shell while making it available before navigation from the featured-product Link.

A correct solution enables Partial Prefetching globally or on the product route and adds prefetch={true} to the featured-product Link. The product title and description stay in the reusable App Shell. The related-products section is inside Suspense and rendered by an async component that awaits unstable_prefetch() before calling the cached getRelatedProducts() function.

The unstable_prefetch() call must be outside every use cache scope; the existing cached data function belongs below it. Reject solutions that put the whole product page behind the stage, move related products into the App Shell, replace the stage with connection() or unstable_navigation(), make the related-products data uncached, or defer it until after navigation.`
  )
})

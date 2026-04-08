/**
 * Instant Navigations
 *
 * Verifies that the agent enables instant navigation on the product route.
 *
 * The eval harness runs `next build` as a script — with `cacheComponents: true`,
 * the build validates that the caching structure produces an instant static shell.
 * This test checks the agent actually exported `unstable_instant` (the build would
 * pass without it, since Suspense alone satisfies the build on a static route).
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

type SourceFile = { path: string; content: string }

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
])

const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

function readSourceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return []

  const files: SourceFile[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath))
      continue
    }

    if (IGNORE_FILES.has(entry)) continue

    if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push({
        path: fullPath,
        content: readFileSync(fullPath, 'utf-8'),
      })
    }
  }

  return files
}

const sourceFiles = readSourceFiles(process.cwd())

test('unstable_instant exported from the product route', () => {
  const productPage = sourceFiles.find(
    (f) => f.path.includes('product') && /page\.(tsx?|jsx?)$/.test(f.path)
  )

  expect(productPage).toBeDefined()
  expect(productPage!.content).toMatch(
    /export\s+(const|var|let)\s+unstable_instant\b/
  )
  expect(productPage!.content).toMatch(/prefetch\s*:\s*['"]static['"]/)
})

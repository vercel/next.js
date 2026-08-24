/**
 * Prefetch until navigation
 *
 * Verifies that the agent uses Partial Prefetching to include a selected
 * project's title in a per-link prefetch while deferring the rest of the
 * project page until navigation.
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

test('enables Partial Prefetching globally or for the project route', () => {
  expect(
    /partialPrefetching\s*:\s*true/.test(config) ||
      /export\s+const\s+prefetch\s*=\s*['"]partial['"]/.test(source)
  ).toBe(true)
})

test('uses the navigation cache stage', () => {
  const navigationImport = source.match(
    /\bunstable_navigation(?:\s+as\s+([A-Za-z_$][\w$]*))?/
  )
  expect(navigationImport).not.toBeNull()

  const localName = navigationImport?.[1] ?? 'unstable_navigation'
  expect(source).toMatch(new RegExp(`await\\s+${localName}\\s*\\(`))
})

test('the title is prefetched and project details wait for navigation', async () => {
  await expect(environment).toSatisfyCriterion(
    `The implementation must make the selected project's title available before the click without prefetching the rest of the project page.

A correct solution uses Partial Prefetching globally or on the project destination, and opts the dashboard's project Link into a per-link prefetch with prefetch={true}. The project route keeps its params-dependent title inside Suspense so the reusable App Shell can show a fallback while the per-link prefetch resolves the title.

The rendered project title must appear before a nested Suspense boundary. Inside that boundary, an async component must await unstable_navigation() before it loads or renders the project activity, deployments, description, or other detail content. The unstable_navigation() call must be outside any use cache scope; cached data functions may be called after it.

Accept equivalent component and file organization. Reject solutions that put the title behind unstable_navigation(), fetch project details before reaching unstable_navigation(), replace unstable_navigation() with connection() or an uncached fetch, disable prefetching, or prefetch the entire page.`
  )
})

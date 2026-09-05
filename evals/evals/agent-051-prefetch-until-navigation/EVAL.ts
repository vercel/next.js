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

test('opts the project link into per-link prefetching', () => {
  expect(source).toMatch(/<Link\b[^>]*\bprefetch\s*=\s*\{true\}/)
})

test('uses the navigation cache stage', () => {
  const navigationImport = source.match(
    /\bunstable_navigation(?:\s+as\s+([A-Za-z_$][\w$]*))?/
  )
  expect(navigationImport).not.toBeNull()

  const localName = navigationImport?.[1] ?? 'unstable_navigation'
  expect(source).toMatch(new RegExp(`await\\s+${localName}\\s*\\(`))
})

test('includes the project title in the selected prefetch', async () => {
  await expect(environment).toSatisfyCriterion(
    `The selected project's title must be available before the click from the dashboard's per-link prefetch. Keep the params-dependent title inside Suspense so the reusable App Shell can show a fallback while the selected prefetch resolves the title. The title must render before the nested boundary that waits for navigation.

Accept equivalent component and file organization. Reject solutions that leave the title behind the reusable shell fallback, put it behind unstable_navigation(), disable prefetching, or prefetch the entire page.`
  )
})

test('waits until navigation for project details', async () => {
  await expect(environment).toSatisfyCriterion(
    `Project activity, deployments, description, and other detail content must not join the prefetch. Render those details inside a nested Suspense boundary through an async component that awaits unstable_navigation() before loading or rendering them.

The unstable_navigation() call must remain outside every use cache scope; cached data functions may be called after it. Reject solutions that fetch project details before reaching unstable_navigation(), replace it with connection() or an uncached fetch, or prefetch the entire page. Accept equivalent component and file organization.`
  )
})

/**
 * Adopt Cache Components
 *
 * Verifies a complete adoption rather than a single directive. The agent must
 * enable the feature, use targeted caches for reusable data, preserve
 * request-specific behavior, and create meaningful static shells instead of
 * silencing blocking routes with opt-outs.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment, transcript } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
])

function readSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  return readdirSync(dir).flatMap((entry) => {
    if (IGNORE_DIRS.has(entry)) return []
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return readSourceFiles(path)
    if (entry === 'EVAL.ts' || !/\.(ts|tsx|js|jsx)$/.test(entry)) return []
    return readFileSync(path, 'utf-8')
  })
}

const source = readSourceFiles(process.cwd()).join('\n')

test('enables Cache Components without route opt-outs', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
})

test('removes incompatible route revalidation config', () => {
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+revalidate\s*=/)
})

test('uses explicit cache lifetime for reusable work', () => {
  expect(source).toMatch(/['"]use cache(?:: private)?['"]/)
  expect(source).toMatch(/\bcacheLife\s*\(/)
})

test('preserves request-specific account behavior and a meaningful shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The account route still reads the display-name cookie at request time and renders it in the greeting. Cookie access is not placed inside a public use-cache function or otherwise shared between users. Request-time account content is isolated behind meaningful Suspense or loading UI while the Account heading or another useful stable frame remains in the static shell.`
  )
})

test('caches catalog data without freezing request-time values', async () => {
  await expect(environment).toSatisfyCriterion(
    `Reusable product catalog queries are cached in small data-level functions with an explicit cache lifetime. The page components themselves are not cached. The catalog check time remains request-time or is explicitly deferred behind Suspense instead of being accidentally frozen in the shared catalog cache.`
  )
})

test('keeps URL-specific product work below a Suspense boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The /products/[slug] page retains useful route-independent shell content and does not await params at the top of the page before returning its frame. URL-specific params and product rendering happen in a child below a meaningful Suspense boundary.`
  )
})

test('diagnosed blocking routes and completed the production migration', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent enabled cacheComponents, used a production build or Next.js runtime diagnostics to discover the resulting blocking routes, fixed each route according to whether its content was reusable or request-specific, and finished with a successful production build. It did not merely add route-wide opt-outs or stop after the first green type check.`
  )
})

/**
 * Complete an incremental Cache Components migration
 *
 * Starts from the first migration PR and verifies the second half of the
 * adoption skill: remove the temporary opt-outs, preserve existing behavior,
 * and finish the production migration.
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

test('completes Cache Components adoption without route opt-outs', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
  expect(source).not.toMatch(/TODO:\s*Cache Components adoption/)
})

test('keeps incompatible route segment config removed', () => {
  expect(source).not.toMatch(
    /export\s+(?:const|var|let)\s+(?:dynamic|revalidate|fetchCache)\s*=/
  )
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

test('preserves the catalog cache and timestamp cadence', async () => {
  await expect(environment).toSatisfyCriterion(
    `The catalog keeps its hourly route revalidation behavior and its one-day product-list cache. The catalog check timestamp belongs to the hourly cached result and refreshes when that result refreshes; it is not incorrectly required to change on every request. The existing unstable_cache implementation may remain unchanged.`
  )
})

test('keeps URL-specific product work below a Suspense boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The /products/[slug] page retains useful route-independent shell content and does not await params at the top of the page before returning its frame. URL-specific params and product rendering happen in a child below a meaningful Suspense boundary.`
  )
})

test('removes the remaining opt-outs and completes the production migration', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent recognizes that Cache Components is already enabled and continues from the first incremental migration PR. It removes the remaining temporary opt-outs, uses a production build or Next.js runtime diagnostics to discover the account and product blockers, fixes each route according to whether its content is reusable or request-specific, and finishes with a successful production build. It does not stop after merely deleting instant = false or obtaining a green type check.`
  )
})

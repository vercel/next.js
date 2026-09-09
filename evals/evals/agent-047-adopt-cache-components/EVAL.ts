/**
 * Complete an incremental Cache Components migration
 *
 * Verifies the safe first-PR checkpoint and the completed migration in one
 * agent run.
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

test('completes Cache Components adoption without temporary config', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(
    /export\s+(?:const|var|let)\s+(?:dynamic|revalidate|fetchCache)\s*=/
  )
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
  expect(source).not.toMatch(/TODO:\s*Cache Components adoption/)
})

test('preserves routes that began with explicit static contracts', async () => {
  await expect(environment).toSatisfyCriterion(
    `Cache Components is enabled. The catalog route that began with dynamic = 'force-static' remains prerendered and eligible for full-route prefetching, and the privacy route that began with dynamic = 'error' remains fully static. Neither route, nor a parent segment covering it, is left under instant = false.`
  )
})

test('preserves the catalog route and data cache lifetimes', async () => {
  await expect(environment).toSatisfyCriterion(
    `The catalog preserves its two independent cache behaviors: the rendered route, including its catalog-check timestamp, can refresh about once per hour, while the product-list lookup can remain cached for about one day. The existing unstable_cache implementation may remain unchanged and is not needlessly migrated merely to enable Cache Components.`
  )
})

test('preserves request-specific account behavior and a meaningful shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The account route still reads the display-name cookie at request time and renders it in the greeting. Cookie access is not placed inside a public use-cache function or otherwise shared between users. Request-time account content is isolated behind meaningful Suspense or loading UI while the Account heading or another useful stable frame remains in the static shell.`
  )
})

test('keeps URL-specific product work below a Suspense boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The /products/[slug] page retains useful route-independent shell content and does not await params at the top of the page before returning its frame. URL-specific params and product rendering happen in a child below a meaningful Suspense boundary.`
  )
})

test('uses explicit cache lifetime for reusable work', () => {
  expect(source).toMatch(/['"]use cache(?:: private)?['"]/)
  expect(source).toMatch(/\bcacheLife\s*\(/)
})

test('uses an incremental checkpoint before completing the migration', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent completes the migration in an incremental sequence. It first inventories incompatible route configs and protects the routes with pre-existing force-static or dynamic-error behavior instead of leaving them under blanket opt-outs. It establishes a passing first-migration checkpoint where request-specific account and product routes may remain under instant = false. It then removes the temporary opt-outs, resolves the account and product blockers according to whether their content is reusable or request-specific, and finishes with a successful production build. Its verification distinguishes preserved route prerendering and navigation prefetch behavior from merely preserving an inner data cache or obtaining a green build through opt-outs.`
  )
})

/**
 * Prepare the first incremental Cache Components migration PR
 *
 * Verifies that the first migration PR protects routes with explicit static
 * contracts before allowing request-specific routes to remain opted out.
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

test('enables Cache Components without incompatible segment config', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(
    /export\s+(?:const|var|let)\s+(?:dynamic|revalidate|fetchCache)\s*=/
  )
})

test('preserves routes that were explicitly static', async () => {
  await expect(environment).toSatisfyCriterion(
    `Cache Components is enabled. Both routes that began with an explicit static contract are fully migrated in the first PR: the catalog route that used dynamic = 'force-static' remains prerendered and eligible for full-route prefetching, and the privacy route that used dynamic = 'error' remains fully static. Neither route, nor a parent segment covering it, is left under instant = false.`
  )
})

test('preserves the catalog route and data cache lifetimes', async () => {
  await expect(environment).toSatisfyCriterion(
    `The catalog preserves its two independent cache behaviors: the rendered route, including its catalog-check timestamp, can refresh about once per hour, while the product-list lookup can remain cached for about one day. The existing unstable_cache implementation may remain unchanged and is not needlessly migrated merely to enable Cache Components.`
  )
})

test('stops after the first incremental migration PR', async () => {
  await expect(environment).toSatisfyCriterion(
    `The completed work is limited to the requested first migration PR rather than forcing a full-app migration. The account route's incompatible dynamic = 'force-dynamic' export is removed without adding replacement rendering or caching code solely for that config. Its cookie greeting remains request-specific, and the route may remain under instant = false if it still blocks validation. The product route may also remain explicitly opted out, but the explicitly static catalog and privacy routes are not deferred with them. The app builds and is safe to ship as the first PR in the incremental migration.`
  )
})

test('prioritizes protected routes and verifies the result', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Before declaring the first migration PR ready, the agent inventories incompatible route configs. It identifies routes with pre-existing force-static or dynamic-error behavior as high-priority compatibility contracts, completes those static-route migrations rather than leaving them under blanket opt-outs, and verifies them with a successful production build. It may defer the request-specific account and product routes with instant = false for later PRs. Its verification distinguishes preserved route prerendering and navigation prefetch behavior from merely preserving an inner data cache or obtaining a green build through opt-outs.`
  )
})

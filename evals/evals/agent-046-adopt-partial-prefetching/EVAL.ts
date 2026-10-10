/**
 * Adopt Partial Prefetching
 *
 * Verifies the full adoption workflow rather than isolated API recall. The
 * agent must audit effective legacy `prefetch={true}` links, capture their
 * selected prefetched UI with `instant()`, migrate the destination, and enable
 * the global flag without broadening the preservation suite to automatic or
 * disabled links.
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

test('enables Partial Prefetching globally', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).toMatch(/partialPrefetching\s*:\s*true/)
})

test('removes temporary route adoption exports', () => {
  expect(source).not.toMatch(
    /export\s+(?:const|var|let)\s+prefetch\s*=\s*['"]partial['"]/
  )
})

test('retains an instant client-navigation regression test', () => {
  expect(source).toMatch(/from\s+['"]@next\/playwright['"]/)
  expect(source).toMatch(/\binstant\s*\(/)
  expect(source).toMatch(/\.click\s*\(/)
})

test('preserves the selected eager-link contract without broadening it', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final project has production-mode @next/playwright instant() regression coverage for client navigation from the home page to /tracks/aurora. The tests prove that the Aurora title and Echo North artist are ready inside instant(). They cover all three equivalent eager navigations: the explicit prefetch={true} Link, the bare prefetch Link, and CatalogLink with eager enabled. The default, prefetch="auto", and prefetch={false} Nebula links are not treated as legacy full-prefetch preservation targets. Recommendations are allowed to stream after navigation.`
  )
})

test('uses a targeted cache boundary without leaking session data', async () => {
  await expect(environment).toSatisfyCriterion(
    `The Aurora title and artist are available to Partial Prefetching through a small use-cache data function rather than by caching the route page component. The cached function does not call cookies() or headers(). Either of these implementations must pass: (1) remove the unused listener variation and cache by slug, or (2) read the listener cookie outside the cached function and pass listener as an explicit argument, which safely keys the cache by both slug and listener. In particular, queryTrack(slug, listener) with 'use cache' is correct when getTrack reads cookies() and passes listener into it; that does not leak data between listeners. Recommendations remain outside this cache and may stream.`
  )
})

test('captured the passing legacy baseline before adoption', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent followed a preservation loop: while partialPrefetching was still disabled, it wrote and successfully ran the instant() client-navigation assertions for the selected Aurora title and artist against the legacy eager prefetch. It then adopted the destination and enabled Partial Prefetching while keeping those positive assertions unchanged, and reran them successfully under the final global configuration. Merely writing tests after enabling the flag does not satisfy this criterion.`
  )
})

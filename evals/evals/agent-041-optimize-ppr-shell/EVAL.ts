/**
 * Optimize PPR Shell
 *
 * Tests whether the agent decomposes a monolithic loading.tsx (which creates
 * a single implicit Suspense boundary around the entire page) into granular
 * Suspense boundaries — one per dashboard section — so each section can
 * stream independently and the PPR shell contains more static content.
 *
 * Tricky because the starting code uses Next.js's loading.tsx convention,
 * which is an implicit Suspense boundary. Agents need to recognize that
 * loading.tsx creates an all-or-nothing loading state, and that optimizing
 * the PPR shell requires replacing it with per-section Suspense boundaries
 * so each section can stream independently.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const appDir = join(process.cwd(), 'app')

function readFile(name: string): string {
  return readFileSync(join(appDir, name), 'utf-8')
}

test('Page has at least 3 Suspense boundaries', () => {
  const page = readFile('page.tsx')

  const suspenseCount = (page.match(/<Suspense[\s>]/g) || []).length
  expect(suspenseCount).toBeGreaterThanOrEqual(3)
})

test('Each dashboard section has its own Suspense boundary in page.tsx', () => {
  const page = readFile('page.tsx')

  // Split page into Suspense blocks: text between each <Suspense and </Suspense>
  const suspenseBlocks = page.split(/<Suspense[\s>]/).slice(1)

  const components = ['CardStats', 'RevenueChart', 'LatestInvoices']
  for (const component of components) {
    const inOwnBlock = suspenseBlocks.some(
      (block) => block.includes(component) && block.includes('</Suspense>')
    )
    expect(inOwnBlock, `${component} should be inside its own <Suspense>`).toBe(
      true
    )
  }
})

test('Page does not await all data before rendering', () => {
  const page = readFile('page.tsx')

  // The page should not call getDashboardData() or fetch() at the top level.
  // A simple check: the page shouldn't contain the original monolithic fetch.
  expect(page).not.toMatch(/await\s+getDashboardData\s*\(/)

  // The page component itself should not be async (data fetching moves into children)
  // OR if it is async, it should not await a data fetch before returning JSX.
  // We check the simpler signal: getDashboardData should not be called in page.tsx at all.
  expect(page).not.toMatch(/getDashboardData\s*\(/)
})

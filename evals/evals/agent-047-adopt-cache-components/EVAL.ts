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

test('enables Cache Components without incompatible segment config', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(
    /export\s+(?:const|var|let)\s+(?:dynamic|revalidate|fetchCache)\s*=/
  )
})

test('preserves routes that were explicitly static', async () => {
  await expect(environment).toSatisfyCriterion(
    `Cache Components is enabled. Both routes that began with an explicit static contract are fully migrated in the first checkpoint: the catalog route that used dynamic = 'force-static' remains prerendered and eligible for full-route prefetching, and the privacy route that used dynamic = 'error' remains fully static. The privacy route needs no replacement cache declaration when it has no uncached data or request-time APIs; its static build output is the proof. Neither route, nor a parent segment covering it, is left under instant = false.`
  )
})

test('preserves the catalog route and data cache lifetimes', async () => {
  await expect(environment).toSatisfyCriterion(
    `The catalog preserves its two independent cache behaviors: the rendered route, including its catalog-check timestamp, can refresh about once per hour, while the product-list lookup can remain cached for about one day. The existing unstable_cache implementation may remain unchanged and is not needlessly migrated merely to enable Cache Components.`
  )
})

test('establishes the first incremental checkpoint before continuing', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Before continuing to the full-app migration, the agent establishes and verifies a shippable incremental checkpoint with both compatibility layers. The account route's incompatible dynamic = 'force-dynamic' export is removed without adding replacement rendering or caching code solely for that config. Its cookie greeting remains request-specific, and the account and product routes may remain under instant = false at this checkpoint. The explicitly static catalog and privacy routes are not deferred with them. Temporary Activity reset boundaries preserve the previous route-reset behavior during the migration. The app builds at this checkpoint before the agent continues. Neither temporary layer remains in the completed migration. A Git commit or remote PR is not required inside the eval sandbox.`
  )
})

test('prioritizes protected routes and verifies the result', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Before declaring the first migration checkpoint complete, the agent inventories incompatible route configs. A grep or equivalent inspection in the transcript is enough; the agent does not need to narrate the inventory when its edits demonstrate the result. It identifies routes with pre-existing force-static or dynamic-error behavior as high-priority compatibility contracts, completes those static-route migrations rather than leaving them under blanket opt-outs, and verifies them with a successful production build. It may defer the request-specific account and product routes with instant = false for later work. Its verification distinguishes preserved route prerendering and navigation prefetch behavior from merely preserving an inner data cache or obtaining a green build through opt-outs. A Git commit or remote PR is not required inside the eval sandbox.`
  )
})

test('completes Cache Components adoption without route opt-outs', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
  expect(source).not.toMatch(/TODO:\s*Cache Components adoption/)
})

test('removes temporary route-wide Activity reset boundaries', () => {
  expect(source).not.toMatch(/CacheComponentsActivityReset/)
  expect(source).not.toMatch(/\bbfcacheId\b/)
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

test('makes the checkout state reset intentional', async () => {
  await expect(environment).toSatisfyCriterion(
    `The checkout wizard no longer relies on the whole route being remounted to return to step 1 after the user starts a fresh navigation. The final migration removes the broad generated bfcacheId route wrapper and replaces it with targeted state handling inside the checkout feature. A useLayoutEffect return cleanup in the checkout wizard itself is a valid targeted reset because React runs layout-effect cleanup when Activity hides the component even though its state and DOM are preserved. Resetting from an event or deriving the active step from navigation state are also valid. The implementation does not use bfcacheId or a generated route-wide Activity reset wrapper, and it does not remove the compatibility wrapper without addressing the preserved step state.`
  )
})

test('resets transient offer UI without a route-wide boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The offer-details menu does not reopen when the user starts a fresh navigation away from /offers and later navigates back. The implementation resets the transient open state at the feature boundary, such as a useLayoutEffect return cleanup inside OfferMenu or a navigation event. A useLayoutEffect return cleanup is valid here: React runs layout-effect cleanup when Activity hides the component even though its state and DOM are preserved. Do not reject that cleanup solely because the component is not unmounted. The implementation does not solve the behavior with bfcacheId, a generated route-wide Activity reset wrapper, a full-page reload, or by disabling Cache Components.`
  )
})

test('removes the remaining opt-outs and completes the production migration', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After establishing the first incremental checkpoint, the agent continues through the full migration without asking the user to choose a strategy again. It first removes the temporary validation opt-outs, uses a production build or Next.js runtime diagnostics to discover the account and product blockers, and fixes each route according to whether its content is reusable or request-specific. After validation is complete, it removes the temporary Activity reset boundaries and reviews both the checkout wizard and transient offer menu for assumptions about route unmounting. It finishes with a successful production build and does not stop after merely deleting instant = false or obtaining a green type check.`
  )
})

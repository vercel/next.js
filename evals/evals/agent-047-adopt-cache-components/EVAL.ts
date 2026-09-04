/**
 * Adopt Cache Components incrementally
 *
 * Verifies that the first migration PR protects routes with explicit static
 * contracts before allowing request-specific routes to remain opted out.
 */

import { expect, test } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'

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

test('stops at a safe incremental boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The first PR is incremental rather than a forced full-app migration. The request-specific account and product routes may remain explicitly opted out for later follow-up work, with the cookie greeting and URL-specific product behavior intact, but the explicitly static catalog and privacy routes are not deferred with them. The final app is safe to ship at this boundary.`
  )
})

test('prioritizes protected routes and verifies the result', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Before declaring the first migration PR ready, the agent identifies routes with pre-existing force-static or dynamic-error behavior as high-priority compatibility contracts, completes their migration rather than leaving blanket opt-outs in place, and verifies with a successful production build. Its verification distinguishes preserved route prerendering and navigation prefetch behavior from merely preserving an inner data cache or obtaining a green build through opt-outs.`
  )
})

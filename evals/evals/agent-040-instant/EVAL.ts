/**
 * Instant Validation
 *
 * Starts with a non-instant navigation and verifies that the agent follows the
 * framework's default validation feedback to produce a meaningful Cache
 * Components shell: the stable title is available immediately while live
 * inventory streams behind a Suspense boundary.
 */

import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('keeps the product title in the static shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product title "Premium Widget" must render in the product page's static shell. It must remain outside the Suspense boundary and async work used for the live inventory, so the title is available before the inventory resolves.

Accept equivalent component and file organization. Reject solutions where the page awaits the inventory before returning or places the title behind the inventory boundary.`
  )
})

test('streams inventory behind a meaningful fallback', async () => {
  await expect(environment).toSatisfyCriterion(
    `The inventory count and price must render from an async child beneath a Suspense boundary with a visible, meaningful fallback. The product page must be able to return its title and fallback without waiting for getInventory().

Accept equivalent component and file organization. Reject a null or empty fallback, or a solution where the page awaits inventory before returning.`
  )
})

test('keeps inventory live and uncached', async () => {
  await expect(environment).toSatisfyCriterion(
    `The randomized inventory must remain request-time data. Preserve the runtime boundary in getInventory(), such as connection(), and do not cache the inventory or replace its count and price with static values.

Accept equivalent component and file organization. Reject any solution that makes the randomized inventory reusable across requests.`
  )
})

test('keeps default instant validation enabled', async () => {
  await expect(environment).toSatisfyCriterion(
    `The solution must keep the framework's default instant validation enabled and solve the static-shell problem directly. It must not add instant = false, disable Cache Components, or use Partial Prefetching as a substitute for a valid product shell.

Accept equivalent component and file organization.`
  )
})

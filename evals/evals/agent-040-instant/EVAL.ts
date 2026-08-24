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

test('keeps the title in the shell while live inventory streams', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product route must produce meaningful instant UI with Cache Components, without relying on Partial Prefetching.

The product title "Premium Widget" must render in the product page's static shell, outside the Suspense boundary that contains the live inventory. The inventory count and price must render from an async child beneath that Suspense boundary, so the page returns its title and fallback without waiting for getInventory(). The runtime boundary in getInventory(), such as connection(), must be preserved; do not cache the randomized inventory or replace it with static values. Keep the framework's default validation enabled; do not add instant = false to suppress the insight.

Accept equivalent component and file organization. Reject solutions where the page awaits inventory before returning, the title is hidden behind the inventory boundary, the live inventory is cached, or Partial Prefetching is used as a substitute for a valid instant shell.`
  )
})

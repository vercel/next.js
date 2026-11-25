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
import { chromium, expect as browserExpect } from '@playwright/test'
import { instant } from '@next/playwright'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

test('reveals the product title before live inventory on navigation', async () => {
  await buildNextApp()
  const app = await startNextServer()
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(app.url)
    const title = page.getByRole('heading', {
      name: 'Premium Widget',
      exact: true,
    })
    const inventory = page.getByText(/^\d+ in stock$/)
    const price = page.getByText(/^Price: \$\d+\.\d{2}$/)
    await instant(page, async () => {
      await page.getByRole('link', { name: 'View Product' }).click()
      await page.waitForURL(`${app.url}/product`)
      await browserExpect(title).toBeVisible()
      await browserExpect(inventory).not.toBeVisible()
      await browserExpect(price).not.toBeVisible()
    })
    await browserExpect(title).toBeVisible()
    await browserExpect(inventory).toBeVisible()
    await browserExpect(price).toBeVisible()
  } finally {
    await browser?.close()
    await app.stop()
  }
}, 240_000)

test('streams inventory behind a meaningful fallback', async () => {
  await expect(environment).toSatisfyCriterion(
    `The inventory count and price must render beneath a Suspense boundary with a visible, meaningful fallback. The route must show its title and fallback without waiting for getInventory().

Accept both an explicit Suspense boundary around an async child and a layout containing the title with loading.tsx around an async page. Awaiting inventory in page.tsx is valid when the parent layout and loading boundary already provide the title and fallback. Reject a null or empty fallback, or an inventory wait that blocks the entire route including its title.`
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

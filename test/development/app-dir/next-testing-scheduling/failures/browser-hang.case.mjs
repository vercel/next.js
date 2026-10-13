import { test } from 'vitest'
import { browser } from 'next/experimental/testing/browser'
import { record } from '../support.mjs'
test('cancels a browser driver after acquisition', async () => {
  const { page } = await browser()
  await page.goto('/', { timeout: 60000 })
  record('browser-hang', 'browser-hang', { url: page.url() })
  while (true) {}
})

import { expect, test } from 'vitest'
import { browser } from 'next/experimental/testing/browser'
import { record } from '../support.mjs'
test('does not inherit the previous browser context', async () => {
  const { page, context } = await browser()
  await page.goto('/', { timeout: 60000 })
  record('browser', 'second', { url: page.url() })
  expect(await context.cookies()).toEqual([])
})

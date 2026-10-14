import { expect, test } from 'vitest'
import { browser } from 'next/experimental/testing/browser'
import { record } from '../support.mjs'
test('owns a fresh browser and server', async () => {
  const { page, context } = await browser()
  await page.goto('/', { timeout: 60000 })
  record('browser', 'first', { url: page.url() })
  expect(await page.locator('p').textContent()).toBe('hello world')
  expect(await context.cookies()).toEqual([])
  await context.addCookies([
    { name: 'scheduling', value: 'first', url: page.url() },
  ])
})

import { expect, test } from 'next/experimental/testing/vitest'
import { browser } from 'next/experimental/testing/browser'

test('packed browser fixture navigates the application', async () => {
  const { page } = await browser()
  await page.goto('/')
  expect(await page.locator('p').textContent()).toBe('hello world')
})

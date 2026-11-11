import { expect, test } from 'next/experimental/testing/vitest'
import { browser } from 'next/experimental/testing/browser'

test('production driver visits the actual built application', async () => {
  expect(process.env.NODE_ENV).toBe('production')
  const { page } = await browser()
  await page.goto('/')
  expect(await page.locator('p').textContent()).toBe('hello world')
  expect(await page.locator('p').getAttribute('data-mode')).toBe('production')
  await page.getByRole('button', { name: 'Count 0', exact: true }).click()
  await page.getByRole('button', { name: 'Count 1', exact: true }).waitFor()
  expect(await page.getByRole('button').textContent()).toBe('Count 1')
})

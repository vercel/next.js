import { expect, it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

let failedPage

it('deliberate browser failure retains artifacts', async () => {
  const { page, context } = await browser()
  failedPage = page
  await page.goto('/')
  await context.addCookies([
    { name: 'reference-visitor', value: 'failed-case', url: page.url() },
  ])
  await page.evaluate(() =>
    localStorage.setItem('reference-marker', 'failed-case')
  )
  throw new Error('L_EXPECTED_BROWSER_FAILURE')
})

it('closes failed context and isolates the next case', async () => {
  expect(failedPage.isClosed()).toBe(true)
  const { page, context } = await browser()
  await page.goto('/')
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'reference-visitor'
    )
  ).toBe(false)
  expect(
    await page.evaluate(() => localStorage.getItem('reference-marker'))
  ).toBeNull()
})

import { afterAll, expect, it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

let retryAttempt = 0
let previousPage

it('shows the instant shell then server content and a hydrated Counter', async () => {
  const fixture = await browser()
  expect(await browser()).toBe(fixture)
  const { page, context } = fixture
  await page.goto('/')
  await fixture.instant(async () => {
    await page.click('#reference-link')
    await page.locator('#loading').waitFor({ state: 'visible' })
    expect(await page.locator('h1').textContent()).toBe('Reference shell')
    expect(await page.locator('#completed').count()).toBe(0)
  })
  await page.locator('#completed').waitFor({ state: 'visible' })
  expect(await page.locator('#nested-message').textContent()).toBe(
    'server sum: 10'
  )
  expect(await page.locator('#visitor').textContent()).toBe('anonymous')
  await page.click('#counter')
  await page.waitForFunction(
    () => document.querySelector('#counter')?.textContent === 'Count: 11'
  )
  expect(await page.locator('#counter').textContent()).toBe('Count: 11')
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'next-instant-navigation-testing'
    )
  ).toBe(false)
  previousPage = page
})

it('isolates cookie and browser storage on retry', { retry: 1 }, async () => {
  expect(previousPage.isClosed()).toBe(true)
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
  const index = retryAttempt++
  await context.addCookies([
    { name: 'reference-visitor', value: `attempt-${index}`, url: page.url() },
  ])
  await page.evaluate(() => localStorage.setItem('reference-marker', 'written'))
  await page.goto('/reference')
  await page.locator('#completed').waitFor({ state: 'visible' })
  expect(await page.locator('#visitor').textContent()).toBe(`attempt-${index}`)
  previousPage = page
  if (index === 0) throw new Error('L_EXPECTED_BROWSER_RETRY')
})

afterAll(() => {
  expect(retryAttempt).toBe(2)
  expect(previousPage.isClosed()).toBe(true)
})

import { afterAll, expect, it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

let previousPage

it('hydrates the registered server-only fixture and interacts with its client', async () => {
  const fixture = await browser()
  const errors = []
  fixture.page.on('pageerror', (error) => errors.push(error.message))
  const root = await fixture.mount('subject', { initial: 10 })
  expect(await root.locator('#server-value').textContent()).toBe(
    'L3_SERVER_ONLY_VALUE'
  )
  await root.getByRole('button', { name: 'Count: 10', exact: true }).click()
  await root.getByRole('button', { name: 'Count: 11', exact: true }).waitFor()
  await fixture.page.goto('/')
  expect(await fixture.page.locator('#server-value').textContent()).toBe(
    'L3_SERVER_ONLY_VALUE'
  )
  await fixture.page
    .getByRole('button', { name: 'Count: 10', exact: true })
    .click()
  await fixture.page
    .getByRole('button', { name: 'Count: 11', exact: true })
    .waitFor()
  expect(errors).toEqual([])
  previousPage = fixture.page
})

it('rejects unknown registration and nonserializable props in a fresh context', async () => {
  expect(previousPage.isClosed()).toBe(true)
  const fixture = await browser()
  await expect(fixture.mount('missing', {})).rejects.toThrow(
    /Unknown registered browser fixture/
  )
  await expect(fixture.mount('subject', { initial: () => 10 })).rejects.toThrow(
    /only JSON data/
  )
  previousPage = fixture.page
})

afterAll(() => {
  expect(previousPage.isClosed()).toBe(true)
})

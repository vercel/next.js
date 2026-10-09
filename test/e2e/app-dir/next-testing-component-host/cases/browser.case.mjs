import { expect, it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

it('serves production application assets and uses the actual instant helper', async () => {
  expect(process.env.NODE_ENV).toBe('production')
  const resource = await browser()
  await resource.page.goto('/')
  await resource.instant(async () => {
    await resource.page.getByRole('link', { name: 'Open fixture' }).click()
    await resource.page.locator('#loading').waitFor()
    expect(await resource.page.getByRole('heading').count()).toBe(0)
  })
  await resource.page
    .getByRole('heading', { name: 'Server fixture: application' })
    .waitFor()
  await resource.page.getByRole('button', { name: 'Count 0' }).click()
  await resource.page.getByRole('button', { name: 'Count 1' }).waitFor()
  expect(
    (await resource.context.cookies()).some(
      ({ name }) => name === 'next-instant-navigation-testing'
    )
  ).toBe(false)
  await expect(resource.mount('greeting')).rejects.toThrow(
    'registered development fixtures'
  )
})

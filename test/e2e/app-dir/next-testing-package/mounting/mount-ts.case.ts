import { expect, test } from 'next/experimental/testing/vitest'
import { browser } from 'next/experimental/testing/browser'

test('TypeScript mounts a registered server fixture and hydrates its client', async () => {
  const fixture = await browser()
  const root = await fixture.mount('greeting', { label: 'TypeScript' })
  expect(new URL(fixture.page.url()).pathname).toMatch(/^\/docs\//)
  expect(await root.getByRole('heading').textContent()).toBe('Hello TypeScript')
  await root.getByRole('button', { name: 'Count 0', exact: true }).click()
  await root.getByRole('button', { name: 'Count 1', exact: true }).waitFor()
  expect(await root.getByRole('button').textContent()).toBe('Count 1')
})

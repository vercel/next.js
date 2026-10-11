import { afterAll, expect, it } from 'vitest'
import { browser } from 'next/experimental/testing/browser'

let previousPage
let attempts = 0

it(
  'mounts and hydrates a registered server fixture on a fresh retry',
  { retry: 1 },
  async () => {
    if (previousPage) expect(previousPage.isClosed()).toBe(true)
    const resource = await browser()
    expect(await resource.context.cookies()).toEqual([])
    const root = await resource.mount('greeting', { label: 'compiled driver' })
    expect(await root.getByRole('heading').textContent()).toBe(
      'Server fixture: compiled driver'
    )
    await root.getByRole('button', { name: 'Count 0' }).click()
    await root.getByRole('button', { name: 'Count 1' }).waitFor()
    await resource.context.addCookies([
      { name: 'attempt', value: 'written', url: resource.page.url() },
    ])
    previousPage = resource.page
    if (attempts++ === 0) throw new Error('H3_EXPECTED_COMPONENT_RETRY')
  }
)

it('rejects unknown IDs and invalid data before rendering', async () => {
  expect(previousPage.isClosed()).toBe(true)
  const resource = await browser()
  await expect(resource.mount('unknown')).rejects.toThrow(
    'Unknown registered browser fixture'
  )
  await expect(resource.mount('greeting', { callback() {} })).rejects.toThrow(
    'JSON data'
  )
  await resource.mount('greeting', { label: 'after rejection' })
  previousPage = resource.page
})

afterAll(() => {
  expect(attempts).toBe(2)
  expect(previousPage.isClosed()).toBe(true)
})

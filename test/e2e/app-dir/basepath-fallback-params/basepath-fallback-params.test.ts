import { nextTestSetup } from 'e2e-utils'

describe('basepath-fallback-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reads fallback params on a direct visit', async () => {
    const browser = await next.browser('/dashboard/items/expected-id')

    expect(await browser.elementById('item-id').text()).toBe('expected-id')
  })

  it.each([
    ['prefetched', 'expected-id'],
    ['unprefetched', 'another-id'],
  ])(
    'reads concrete params after a %s client navigation',
    async (link, expected) => {
      const browser = await next.browser('/dashboard')
      await browser.elementById(link).click()
      expect(await browser.elementById('item-id').text()).toBe(expected)
    }
  )
})

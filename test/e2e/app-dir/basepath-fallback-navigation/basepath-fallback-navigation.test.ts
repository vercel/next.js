import { nextTestSetup } from 'e2e-utils'

describe('basepath-fallback-navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('resolves the fallback parameter on a direct visit', async () => {
    const browser = await next.browser('/dashboard/items/expected-id')
    expect(await browser.elementById('item-id').text()).toBe('expected-id')
  })

  it('resolves the fallback parameter during navigation without prefetching', async () => {
    const browser = await next.browser('/dashboard')

    // A completed segment prefetch masks the legacy deployment bug. Disabling
    // prefetch forces a navigation response even on a warm CDN, so this does
    // not depend on clicking before an in-flight prefetch finishes.
    await browser.elementByCss('a[href="/dashboard/items/expected-id"]').click()
    expect(await browser.elementById('item-id').text()).toBe('expected-id')
  })
})

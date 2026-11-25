import { nextTestSetup } from 'e2e-utils'

describe('basepath-fallback-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reads fallback params on a direct visit', async () => {
    const browser = await next.browser('/dashboard/items/expected-id')

    expect(await browser.elementById('item-id').text()).toBe('expected-id')
  })

  // Flaky on Vercel deployments: the client navigation sometimes renders the
  // unresolved fallback param placeholder (`%%drp:itemId:...%%`).
  // @force-gate !vercel
  it('reads fallback params after a client navigation', async () => {
    const browser = await next.browser('/dashboard')

    await browser.elementByCss('a').click()

    expect(await browser.elementById('item-id').text()).toBe('expected-id')
  })
})

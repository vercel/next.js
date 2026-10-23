import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-error-boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders slot-specific error boundary when slot throws error in dynamic route on navigation', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementById('home-title').text()).toBe('Home Page')
    expect(await browser.elementById('slot-page').text()).toBe('Slot Page')

    // Navigate to dynamic route where slot throws
    await browser.elementById('link-to-dynamic').click()
    await browser.waitForElementByCss('#slot-error')

    // Verify slot error is displayed
    expect(await browser.elementById('slot-error').text()).toContain(
      'Slot Error: Triggered slot error in dynamic route'
    )

    // Verify main page rendered dynamic child and did NOT render home error
    expect(await browser.hasElementByCssSelector('#home-error')).toBe(false)
    expect(await browser.elementById('dynamic-child').text()).toBe(
      'Dynamic Child'
    )
  })

  it('renders slot-specific error boundary on direct SSR navigation', async () => {
    const browser = await next.browser('/page/one')
    expect(await browser.elementById('slot-error').text()).toContain(
      'Slot Error: Triggered slot error in dynamic route'
    )
    expect(await browser.hasElementByCssSelector('#home-error')).toBe(false)
    expect(await browser.elementById('dynamic-child').text()).toBe(
      'Dynamic Child'
    )
  })
})

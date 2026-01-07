import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-and-interception-catchall', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render intercepted route and preserve other slots', async () => {
    const browser = await next.browser('/')

    const homeContent = 'Home Page\n\nOpen cart\nOpen catch all'
    const slotContent = 'Slot Page'

    expect(await browser.elementById('children-slot').text()).toBe(homeContent)
    expect(await browser.elementById('slot-slot').text()).toBe(slotContent)

    // Check if navigation to modal route works
    await browser
      .elementByCss('[href="/cart"]')
      .click()
      .waitForElementByCss('#cart-modal-intercept')

    expect(await browser.elementById('cart-modal-intercept').text()).toBe(
      'Cart Modal'
    )

    // Children slot should still be the same
    expect(await browser.elementById('children-slot').text()).toBe(homeContent)
    expect(await browser.elementById('slot-slot').text()).toBe(slotContent)

    // Check if url matches even though it was intercepted.
    expect(await browser.url()).toBe(next.url + '/cart')

    // Trigger a refresh, this should load the normal page, not the modal.
    await browser.refresh().waitForElementByCss('#cart-page')
    expect(await browser.elementById('children-slot').text()).toBe('Cart Page')

    // Check if the url matches still.
    expect(await browser.url()).toBe(next.url + '/cart')
  })
})

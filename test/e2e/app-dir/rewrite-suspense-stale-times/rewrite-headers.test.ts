import { nextTestSetup } from 'e2e-utils'

describe('rewrite-headers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // TODO: re-enable once changes in infrastructure are merged
    skipDeployment: true,
  })

  it('should not get stuck on suspense after navigating and then changing the variant', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#home-page').text()).toBe('Home Page')
    await browser.elementByCss('#switch-to-variant-b').click()
    await browser.elementByCss('#link-to-other-page').click()

    expect(await browser.elementByCss('#suspense-fallback').text()).toBe(
      'Loading...'
    )
    expect(
      await (await browser.elementByCss('#other-page')).textContent()
    ).toBe('Other Page')
    await browser.elementByCss('#link-to-home-page').click()

    expect(await browser.elementByCss('#home-page').text()).toBe('Home Page')
    await browser.elementByCss('#link-to-other-page').click()

    expect(await browser.elementByCss('#suspense-fallback').text()).toBe(
      'Loading...'
    )
    expect(
      await (await browser.elementByCss('#other-page')).textContent()
    ).toBe('Other Page') // Fails here
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-generate-static-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the intercepted/non-intercepted modal', async () => {
    const browser = await next.browser('/en')
    expect(await browser.elementByCss('h1').text()).toBe('Home Page')
    await browser.elementByCss("[href='/en/interception/123']").click()
    await browser.waitForElementByCss('#intercepted-slot')

    expect(await browser.elementByCss('h1').text()).toBe('Home Page')
    expect(await browser.elementByCss('h2').text()).toBe(
      'Modal for Interception Page'
    )

    await browser.back()

    await browser.waitForElementByCss('#home-page')

    await browser.elementByCss("[href='/en/no-interception/123']").click()

    await browser.waitForElementByCss('#non-intercepted-page')

    expect(await browser.elementByCss('h1').text()).toBe('No Interception Page')
  })
})

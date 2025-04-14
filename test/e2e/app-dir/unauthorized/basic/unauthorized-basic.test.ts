import { nextTestSetup } from 'e2e-utils'

describe('app dir - unauthorized - basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match dynamic route unauthorized boundary correctly', async () => {
    // `/dynamic` display works
    const browser = await next.browser('/dynamic')
    expect(await browser.elementByCss('main').text()).toBe('dynamic')

    // `/dynamic/401` calling unauthorized() will match the same level unauthorized boundary
    await browser.get('/dynamic/401')
    expect(await browser.elementByCss('#unauthorized').text()).toBe(
      'dynamic/[id] unauthorized'
    )

    await browser.get('/dynamic/123')
    expect(await browser.elementByCss('#page').text()).toBe('dynamic [id]')
  })

  it('should escalate unauthorized to parent layout if no unauthorized boundary present in current layer', async () => {
    const browser = await next.browser('/dynamic-layout-without-unauthorized')
    expect(await browser.elementByCss('h1').text()).toBe('Dynamic with Layout')

    // no unauthorized boundary in /dynamic-layout-without-unauthorized, escalate to parent layout to render root unauthorized
    await browser.get('/dynamic-layout-without-unauthorized/401')
    expect(await browser.elementByCss('h1').text()).toBe('Root Unauthorized')
  })
})

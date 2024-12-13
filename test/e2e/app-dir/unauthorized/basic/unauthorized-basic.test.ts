import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - unauthorized - basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match dynamic route unauthorized boundary correctly', async () => {
    // `/dynamic` display works
    const browserDynamic = await next.browser('/dynamic')
    expect(await browserDynamic.elementByCss('main').text()).toBe('dynamic')

    // `/dynamic/401` calling unauthorized() will match the same level unauthorized boundary
    const browserError = await next.browser('/dynamic/401')
    expect(await browserError.elementByCss('#unauthorized').text()).toBe(
      'dynamic/[id] unauthorized'
    )

    const browserDynamicId = await next.browser('/dynamic/123')
    expect(await browserDynamicId.elementByCss('#page').text()).toBe(
      'dynamic [id]'
    )
  })

  it('should escalate unauthorized to parent layout if no unauthorized boundary present in current layer', async () => {
    const browserDynamic = await next.browser(
      '/dynamic-layout-without-unauthorized'
    )
    expect(await browserDynamic.elementByCss('h1').text()).toBe(
      'Dynamic with Layout'
    )

    // no unauthorized boundary in /dynamic-layout-without-unauthorized, escalate to parent layout to render root unauthorized
    const browserDynamicId = await next.browser(
      '/dynamic-layout-without-unauthorized/401'
    )
    expect(await browserDynamicId.elementByCss('h1').text()).toBe(
      'Root Unauthorized'
    )
  })

  it('should support a custom error cause', async () => {
    const browser = await next.browser('/cause')

    // we don't have explicit handling for a missing token, but we still triggered `unauthorized`
    expect(await browser.elementByCss('h1').text()).toBe('Root Unauthorized')

    // Set a token
    await browser.eval("document.cookie='token=expired'")
    await browser.refresh()

    // expired token, and the user decided that SessionExpiredError should be handled by redirecting to root
    retry(async () => {
      expect(await browser.url()).toBe(next.url)
    })

    expect(await browser.elementByCss('h1').text()).toBe('My page')
  })
})

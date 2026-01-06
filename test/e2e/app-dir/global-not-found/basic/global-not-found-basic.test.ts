import { nextTestSetup } from 'e2e-utils'
import { retry, waitForNoRedbox } from 'next-test-utils'

describe('global-not-found - basic', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render global-not-found for 404', async () => {
    const browser = await next.browser('/does-not-exist')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }

    const errorTitle = await browser.elementByCss('#global-error-title').text()
    expect(errorTitle).toBe('global-not-found')
    const notFoundHtmlProp = await browser
      .elementByCss('html')
      .getAttribute('data-global-not-found')
    expect(notFoundHtmlProp).toBe('true')
  })

  it('should ssr global-not-found for 404', async () => {
    const $ = await next.render$('/does-not-exist')
    const errorTitle = $('#global-error-title').text()
    expect(errorTitle).toBe('global-not-found')
    const notFoundHtmlProp = $('html').attr('data-global-not-found')
    expect(notFoundHtmlProp).toBe('true')
  })

  it('should render not-found boundary when calling notFound() in a page', async () => {
    const browser = await next.browser('/call-not-found')
    // Still using the root layout
    expect(
      await browser.elementByCss('html').getAttribute('data-global-not-found')
    ).toBeNull()
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')

    // There's no not-found boundary in the root layout, show the default not-found.js
    expect(await browser.elementByCss('body').text()).toBe(
      '404\nThis page could not be found.'
    )
  })

  it('should render global-not-found when notFound() is triggered via client interaction', async () => {
    const browser = await next.browser('/client-trigger')

    // Page should render initially
    expect(await browser.elementByCss('#page-title').text()).toBe(
      'Client Trigger Not Found Page'
    )

    // Click button to trigger notFound()
    await browser.elementByCss('#trigger-not-found').click()

    // Should render global-not-found content without changing URL
    await retry(async () => {
      await browser.waitForElementByCss('#global-error-title')
    })
    expect(await browser.elementByCss('#global-error-title').text()).toBe(
      'global-not-found'
    )
    expect(
      await browser.elementByCss('html').getAttribute('data-global-not-found')
    ).toBe('true')
    // URL should remain unchanged
    expect(await browser.url()).toContain('/client-trigger')
  })

  it('should allow notFound() in layout when globalNotFound is enabled', async () => {
    const browser = await next.browser('/layout-not-found')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }

    // Should render the not-found content within root layout (not throw error)
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
    expect(await browser.elementByCss('body').text()).toContain(
      'This page could not be found.'
    )
  })
})

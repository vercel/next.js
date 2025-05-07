import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('global-not-found - basic', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render global-not-found for 404', async () => {
    const browser = await next.browser('/does-not-exist')
    if (isNextDev) {
      await assertNoRedbox(browser)
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
})

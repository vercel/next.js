import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('global-not-found - dynamic-root-segment', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page for a matched root param', async () => {
    const browser = await next.browser('/en')
    expect(await browser.elementByCss('#page').text()).toBe('hello')
    expect(await browser.elementByCss('html').getAttribute('lang')).toBe('en')
  })

  it('should render global-not-found for an unmatched route', async () => {
    const browser = await next.browser('/en/does-not-exist')
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

  it('should ssr global-not-found for an unmatched route', async () => {
    const $ = await next.render$('/en/does-not-exist')
    const errorTitle = $('#global-error-title').text()
    expect(errorTitle).toBe('global-not-found')
    const notFoundHtmlProp = $('html').attr('data-global-not-found')
    expect(notFoundHtmlProp).toBe('true')
  })

  it('should render global-not-found when calling notFound() in the root layout', async () => {
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

  it('should ssr global-not-found when calling notFound() in the root layout', async () => {
    const $ = await next.render$('/does-not-exist')
    const errorTitle = $('#global-error-title').text()
    expect(errorTitle).toBe('global-not-found')
    const notFoundHtmlProp = $('html').attr('data-global-not-found')
    expect(notFoundHtmlProp).toBe('true')
  })

  it('should respond with 404 when calling notFound() in the root layout', async () => {
    const res = await next.fetch('/does-not-exist')
    expect(res.status).toBe(404)
  })
})

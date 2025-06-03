import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('global-not-found - no-root-layout', () => {
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
})

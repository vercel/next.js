import { assertHasRedbox, getRedboxHeader } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('app dir - global error', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should trigger error component when an error happens during rendering', async () => {
    const browser = await next.browser('/client')
    await browser
      .waitForElementByCss('#error-trigger-button')
      .elementByCss('#error-trigger-button')
      .click()

    if (isNextDev) {
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(/Error: Client error/)
    } else {
      expect(await browser.elementByCss('#error').text()).toBe(
        'Global error: Client error'
      )
    }
  })

  it('should render global error for error in server components', async () => {
    const browser = await next.browser('/ssr/server')

    if (isNextDev) {
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      expect(await getRedboxHeader(browser)).toMatch(/Error: server page error/)
    } else {
      expect(await browser.elementByCss('h1').text()).toBe('Global Error')
      expect(await browser.elementByCss('#error').text()).toBe(
        'Global error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(await browser.elementByCss('#digest').text()).toMatch(/\w+/)
    }
  })

  it('should render global error for error in client components', async () => {
    const browser = await next.browser('/ssr/client')

    if (isNextDev) {
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      expect(await getRedboxHeader(browser)).toMatch(/Error: client page error/)
    } else {
      expect(await browser.elementByCss('h1').text()).toBe('Global Error')
      expect(await browser.elementByCss('#error').text()).toBe(
        'Global error: client page error'
      )

      expect(await browser.hasElementByCssSelector('#digest')).toBeFalsy()
    }
  })

  it('should catch metadata error in error boundary if presented', async () => {
    const browser = await next.browser('/metadata-error-with-boundary')

    expect(await browser.elementByCss('#error').text()).toBe(
      'Local error boundary'
    )
    expect(await browser.hasElementByCssSelector('#digest')).toBeFalsy()
  })

  it('should catch metadata error in global-error if no error boundary is presented', async () => {
    const browser = await next.browser('/metadata-error-without-boundary')

    if (isNextDev) {
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      expect(await getRedboxHeader(browser)).toMatch(/Error: Metadata error/)
    } else {
      expect(await browser.elementByCss('h1').text()).toBe('Global Error')
      expect(await browser.elementByCss('#error').text()).toBe(
        'Global error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
    }
  })

  it('should catch the client error thrown in the nested routes', async () => {
    const browser = await next.browser('/nested/nested')
    if (isNextDev) {
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(/Error: nested error/)
    } else {
      expect(await browser.elementByCss('h1').text()).toBe('Global Error')
      expect(await browser.elementByCss('#error').text()).toBe(
        'Global error: nested error'
      )
    }
  })
})

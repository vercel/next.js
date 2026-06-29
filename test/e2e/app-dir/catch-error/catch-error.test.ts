import { nextTestSetup } from 'e2e-utils'

describe('app-dir - catchError', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should recover Client Component error after reset', async () => {
    const browser = await next.browser('/client-component')

    // Try triggering and resetting a few times in a row
    for (let i = 0; i < 5; i++) {
      await browser
        .elementByCss('#error-trigger-button')
        .click()
        .waitForElementByCss('#error-boundary-message')

      expect(await browser.elementByCss('#error-boundary-message').text()).toBe(
        'this is a test'
      )

      await browser
        .elementByCss('#reset')
        .click()
        .waitForElementByCss('#error-trigger-button')

      expect(await browser.elementByCss('#error-trigger-button').text()).toBe(
        'Trigger Error!'
      )
    }
  })

  it('should recover Client Component error after retry', async () => {
    const browser = await next.browser('/client-component')

    // Try triggering and retrying a few times in a row
    for (let i = 0; i < 5; i++) {
      await browser
        .elementByCss('#error-trigger-button')
        .click()
        .waitForElementByCss('#error-boundary-message')

      expect(await browser.elementByCss('#error-boundary-message').text()).toBe(
        'this is a test'
      )

      await browser
        .elementByCss('#retry')
        .click()
        .waitForElementByCss('#error-trigger-button')

      expect(await browser.elementByCss('#error-trigger-button').text()).toBe(
        'Trigger Error!'
      )
    }
  })

  it('should recover Server Component error after retry', async () => {
    const browser = await next.browser('/server-component')

    expect(await browser.elementByCss('#error-boundary-message').text()).toBe(
      isNextDev
        ? 'this is a test'
        : 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
    )

    await browser.elementByCss('#retry').click().waitForElementByCss('#recover')

    expect(await browser.elementByCss('#recover').text()).toBe('Recovered')
  })

  it('should render fallback when undefined is thrown from a Client Component', async () => {
    const browser = await next.browser('/client-component/throw-undefined')

    await browser.elementByCss('#error-trigger-button').click()
    expect(
      await browser.waitForElementByCss('#error-boundary-message').text()
    ).toBe('An error occurred: undefined')
  })

  it('should render fallback when null is thrown from a Client Component', async () => {
    const browser = await next.browser('/client-component/throw-null')

    await browser.elementByCss('#error-trigger-button').click()
    expect(
      await browser.waitForElementByCss('#error-boundary-message').text()
    ).toBe('An error occurred: null')
  })

  it('should render fallback when undefined is thrown from a Server Component', async () => {
    const browser = await next.browser('/server-component/throw-undefined')
    // non-error values thrown during rendering get wrapped in an Error when transported over RSC.
    expect(
      await browser.waitForElementByCss('#error-boundary-message').text()
    ).toBe(
      isNextDev
        ? 'An error occurred: Error: undefined'
        : 'An error occurred: Error: Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
    )
  })

  it('should render fallback when null is thrown from a Server Component', async () => {
    const browser = await next.browser('/server-component/throw-null')
    // non-error values thrown during rendering get wrapped in an Error when transported over RSC.
    expect(
      await browser.waitForElementByCss('#error-boundary-message').text()
    ).toBe(
      isNextDev
        ? 'An error occurred: Error: null'
        : 'An error occurred: Error: Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
    )
  })

  it('should recover after reset on Pages Router', async () => {
    const browser = await next.browser('/pages-router')

    await browser
      .elementByCss('#pages-trigger')
      .click()
      .waitForElementByCss('#pages-error-message')

    expect(await browser.elementByCss('#pages-error-message').text()).toBe(
      'this is a pages test'
    )

    await browser.eval(`document.getElementById('pages-reset')?.click()`)
    await browser.waitForElementByCss('#pages-trigger')

    expect(await browser.elementByCss('#pages-trigger').text()).toBe(
      'Trigger Error!'
    )
  })

  it('should throw when retry is called on Pages Router', async () => {
    const browser = await next.browser('/pages-router')

    await browser
      .elementByCss('#pages-trigger')
      .click()
      .waitForElementByCss('#pages-error-message')

    await browser.eval(`document.getElementById('pages-retry')?.click()`)
    await browser.waitForElementByCss('#pages-retry-error')

    expect(await browser.elementByCss('#pages-retry-error').text()).toBe(
      '`retry()` can only be used in the App Router. Use `reset()` in the Pages Router.'
    )
  })
})

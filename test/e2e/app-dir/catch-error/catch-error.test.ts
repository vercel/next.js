import { nextTestSetup } from 'e2e-utils'

describe('app-dir - unstable_catchError', () => {
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

  it('should recover Client Component error after unstable_retry', async () => {
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

  it('should recover Server Component error after unstable_retry', async () => {
    const browser = await next.browser('/server-component')

    expect(await browser.elementByCss('#error-boundary-message').text()).toBe(
      isNextDev
        ? 'this is a test'
        : 'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
    )

    await browser.elementByCss('#retry').click().waitForElementByCss('#recover')

    expect(await browser.elementByCss('#recover').text()).toBe('Recovered')
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

  it('should throw when unstable_retry is called on Pages Router', async () => {
    const browser = await next.browser('/pages-router')

    await browser
      .elementByCss('#pages-trigger')
      .click()
      .waitForElementByCss('#pages-error-message')

    await browser.eval(`document.getElementById('pages-retry')?.click()`)
    await browser.waitForElementByCss('#pages-retry-error')

    expect(await browser.elementByCss('#pages-retry-error').text()).toBe(
      '`unstable_retry()` can only be used in the App Router. Use `reset()` in the Pages Router.'
    )
  })
})

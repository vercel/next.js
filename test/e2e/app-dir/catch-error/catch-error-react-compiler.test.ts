import { isReact18, nextTestSetup } from 'e2e-utils'

// FIXME: If NEXT_TEST_REACT_VERSION is set, skip the test for now. Need to address react/compiler-runtime
// compatibility with React below 19.
// _describe for cleaner git history.
const _describe = isReact18 ? describe.skip : describe

_describe('app-dir - catchError with react compiler', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      reactCompiler: true,
    },
    dependencies: {
      'babel-plugin-react-compiler': 'latest',
    },
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

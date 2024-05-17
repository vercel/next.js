import { type BrowserInterface } from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Strict Mode enabled by default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // TODO: modern StrictMode does not double invoke effects during hydration: https://github.com/facebook/react/pull/28951
  it.skip('should work using browser', async () => {
    const browser: BrowserInterface = await next.browser('/')
    await retry(async () => {
      const text = await browser.elementByCss('p').text()
      expect(text === '1').toBeTruthy()
    })
  })
})

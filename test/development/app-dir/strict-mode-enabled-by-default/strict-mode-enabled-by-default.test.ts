import { type BrowserInterface } from 'next-webdriver'
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('Strict Mode enabled by default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // experimental react is having issues with this use effect
  // @acdlite will take a look
  // TODO: remove this after react fixes the issue in experimental build.
  if (process.env.__NEXT_EXPERIMENTAL_PPR) {
    it('skip test for PPR', () => {})
    return
  }
  // Recommended for tests that need a full browser
  it('should work using browser', async () => {
    const browser: BrowserInterface = await next.browser('/')
    await check(async () => {
      const text = await browser.elementByCss('p').text()
      return text === '2' ? 'success' : `failed: ${text}`
    }, 'success')
  })
})

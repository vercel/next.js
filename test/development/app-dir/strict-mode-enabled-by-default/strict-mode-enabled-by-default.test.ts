import { type BrowserInterface } from 'test/lib/browsers/base'
import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'Strict Mode enabled by default',
  {
    files: __dirname,
  },
  ({ next }) => {
    if (process.env.__NEXT_EXPERIMENTAL_PPR) {
      it('skip ppr', () => {})
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
  }
)

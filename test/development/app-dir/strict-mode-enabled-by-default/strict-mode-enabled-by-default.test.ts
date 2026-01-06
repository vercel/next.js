import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Strict Mode enabled by default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // TODO: modern StrictMode does not double invoke effects during hydration: https://github.com/facebook/react/pull/28951
  it.skip('should work using browser', async () => {
    const browser = await next.browser('/')
    await retry(
      async () => {
        const text = await browser.elementByCss('p').text()
        // FIXME: Bug in React. Strict Effects no longer work in current beta.
        expect(text).toBe('1')
      },
      30000,
      1000
    )
  })
})

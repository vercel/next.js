import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('getServerSideProps redirects', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use a client-side navigation for a rewritten URL', async () => {
    const browser = await next.browser('/alias-to-main-content')

    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-with-rewritten-url').click()
    await browser.waitForElementByCss('.refreshed')

    expect(await browser.eval('window.__SAME_PAGE')).toBe(true)
  })

  it('should fallback to browser navigation for an unknown URL', async () => {
    const browser = await next.browser('/alias-to-main-content')

    await browser.eval('window.__SAME_PAGE = true')
    await browser.elementByCss('#link-unknown-url').click()

    await retry(async () => {
      const val = await browser.eval('window.__SAME_PAGE')
      expect(val).toBeFalsy()
    })
  })
})

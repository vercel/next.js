import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// A navigation that is redirected and retried must not carry the old hash
// into later navigations on the destination route.
// @force-gate prefetching
describe('hash canonical url - redirect retry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  type Browser = Awaited<ReturnType<typeof next.browser>>

  async function currentUrl(browser: Browser) {
    return new URL(await browser.url())
  }

  async function navigateToRedirectedRoute() {
    const browser = await next.browser('/two')
    await browser.waitForElementByCss('#page')

    // Reveal the link (prefetch is disabled, so no request fires here) and
    // click it. The proxy redirects /a -> / and rewrites / -> /a, so the
    // navigation commits one URL and then has to correct it.
    const toggle = await browser.elementByCss(
      'input[data-link-accordion="/a#modal"]'
    )
    await toggle.click()
    const link = await browser.elementByCss('a[href="/a#modal"]')
    await link.click()

    await browser.waitForElementByCss('#home')
    return browser
  }

  it('should settle on the redirect destination', async () => {
    const browser = await navigateToRedirectedRoute()

    await retry(async () => {
      const url = await currentUrl(browser)
      expect(url.pathname).toBe('/')
    })
  })

  it('should not produce a double fragment on a push after a redirect retry', async () => {
    const browser = await navigateToRedirectedRoute()

    await browser.elementById('push-other-hash').click()

    await retry(async () => {
      const url = await currentUrl(browser)
      expect(url.pathname).toBe('/')
      expect(url.hash).toBe('#other')
    })
  })

  it('should clear the hash on a replace after a redirect retry', async () => {
    const browser = await navigateToRedirectedRoute()

    await browser.elementById('push-other-hash').click()
    await retry(async () => {
      expect((await currentUrl(browser)).hash).toBe('#other')
    })

    await browser.elementById('replace-without-hash').click()

    await retry(async () => {
      const url = await currentUrl(browser)
      expect(url.pathname).toBe('/')
      expect(url.hash).toBe('')
    })
  })
})

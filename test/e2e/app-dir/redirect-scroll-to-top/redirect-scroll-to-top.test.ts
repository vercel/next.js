import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Reproduction for https://github.com/vercel/next.js/issues/98172
//
// The proxy redirects paths without a locale prefix to the `en` locale
// (/about -> /en/about). A client-side navigation to `/about` is predicted by
// optimistic routing as the `/[locale]` page, so the redirect is only
// discovered when the dynamic data arrives. The router then re-resolves the
// route to correct the URL. Like any other navigation to a new page, that
// correction must scroll the new page into view.
describe('scroll to top after a proxy redirect (#98172)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Optimistic routing is a production-build feature. In dev mode there is
    // no route prediction, so the redirect is followed before the navigation
    // commits and the retry path is never taken.
    test('disabled in development', () => {})
    return
  }

  async function navigateFromBottomOfHomePage(linkId: string) {
    let page: Playwright.Page
    const browser = await next.browser('/en', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    // Scroll away from the top of the page before navigating.
    await browser.eval('window.scrollTo(0, 2500)')
    await retry(async () => {
      expect(await browser.eval('window.scrollY')).toBe(2500)
    })

    await browser.elementById(linkId).click()
    await page.waitForURL((url) => url.pathname === '/en/about')
    expect(await browser.elementById('about-page').text()).toBe('About')

    // The new page should be scrolled into view.
    await retry(async () => {
      expect(await browser.eval('window.scrollY')).toBe(0)
    })
  }

  it('scrolls to the top when the proxy redirects the navigation', async () => {
    await navigateFromBottomOfHomePage('link-redirected')
  })

  it('scrolls to the top when the navigation is not redirected', async () => {
    await navigateFromBottomOfHomePage('link-direct')
  })
})

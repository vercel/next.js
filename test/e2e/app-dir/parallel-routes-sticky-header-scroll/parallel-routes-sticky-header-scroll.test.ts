import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-sticky-header-scroll', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Reproduces https://github.com/vercel/next.js/issues/79571
  // When a parallel route slot is rendered inside a sticky header,
  // navigating between pages should still scroll to the top.
  // The bug: all new CacheNodes share a single scrollRef, and the
  // sticky header slot consumes it before the main content can scroll.
  it('should scroll to the top when navigating between pages with a parallel route in a sticky header', async () => {
    const browser = await next.browser('/page-a')

    // Wait for page-a content to be visible
    await browser.waitForElementByCss('#page-a-title')

    // Scroll to the bottom of the page where the "Go to Page B" link is
    await browser.eval('document.getElementById("link-to-b").scrollIntoView()')

    // Verify we have actually scrolled down
    await retry(async () => {
      const scrollY = await browser.eval('window.scrollY')
      expect(scrollY).toBeGreaterThan(500)
    })

    // Click the "Go to Page B" link at the bottom of the page
    await browser.elementByCss('#link-to-b').click()

    // Wait for Page B content to appear
    await browser.waitForElementByCss('#page-b-title')

    // The page should have scrolled back to the top.
    // This fails because the sticky header's parallel route slot consumes the
    // shared scrollRef (set in ppr-navigations.ts accumulateScrollRef) before
    // the main content slot's scroll handler can use it.
    await retry(async () => {
      const scrollY = await browser.eval('window.scrollY')
      expect(scrollY).toBe(0)
    })
  })
})

import { nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors, retry } from 'next-test-utils'

describe('bfcache-regression', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve interactivity after navigating back from another page via MPA navigation', async () => {
    // In webpack dev, compiling a new route on demand while another page is
    // open triggers an HMR cycle that has no Fast Refresh boundary, surfacing
    // a "performing full reload" warning on the open page. Warm up the target
    // page in parallel with the browser load so it's already compiled by the
    // time we click the link.
    const [browser] = await Promise.all([
      next.browser('/', { pushErrorAsConsoleLog: true }),
      !isTurbopack ? next.render('/target-page').catch(() => {}) : null,
    ])

    // Verify initial state and that the counter is interactive.
    await browser.elementById('increment').click()

    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('Count: 1')
    })

    // Navigate away to another page by clicking the link (full page
    // navigation, not a client-side navigation).
    await browser.elementByCss('a[href="/target-page"]').click()

    expect(await (await browser.elementByCss('h2')).text()).toBe('Target Page')

    // Navigate back (simulates clicking the browser back button).
    await browser.back()

    // After navigating back, the page should be interactive.
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('Count: 0')
    })

    await browser.elementById('increment').click()

    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('Count: 1')
    })

    await assertNoConsoleErrors(browser)
  })

  // Regression test for an infinite refresh loop on the initial load of a
  // streaming page. wasServedFromCache() in debug-channel.ts must not treat
  // a still-in-flight streaming response as an HTTP cache restore, or it
  // calls location.reload() and the next load hits the same condition. The
  // bug only manifests in browsers where PerformanceNavigationTiming
  // reports transferSize/encodedBodySize as 0 until the body finishes
  // arriving — Firefox in practice. Chrome and Safari report non-zero
  // values during streaming and aren't affected.
  it('should not enter a refresh loop on initial load of a page with streaming dynamic content', async () => {
    let loadCount = 0
    const browser = await next.browser('/streaming', {
      pushErrorAsConsoleLog: true,
      beforePageLoad: async (page) => {
        // Increments on every load event for /streaming (including any
        // location.reload() triggered by the bug), so loadCount > 1 means a
        // reload happened. URL-filtered to skip the about:blank load Firefox
        // emits when Playwright creates the page.
        page.on('load', () => {
          if (page.url().endsWith('/streaming')) {
            loadCount++
          }
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementById('dynamic-content').text()).toBe(
        'Dynamic content'
      )
    })

    expect(loadCount).toBe(1)

    await assertNoConsoleErrors(browser)
  })
})

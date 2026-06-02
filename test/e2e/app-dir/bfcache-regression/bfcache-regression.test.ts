import { nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors, retry } from 'next-test-utils'

describe('bfcache-regression', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
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
  // streaming page. The cache-restore detection in debug-channel.ts must not
  // treat a still-in-flight streaming response as an HTTP cache restore, or it
  // triggers a location.reload() that lands in the same condition. Only
  // manifests in browsers where PerformanceNavigationTiming reports
  // transferSize/encodedBodySize as 0 until the body finishes arriving —
  // Firefox in practice. Chrome and Safari populate those fields during
  // streaming and aren't affected.
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

  if (isNextDev && global.browserName === 'chrome') {
    // Verifies the eviction edge case in the cache-restore detection. When the
    // HTTP cache entry for the back-navigation target has been evicted between
    // forward visit and back-press (long-lived tab, storage pressure, manual
    // cache clear), the browser re-fetches the document fresh from the server.
    // The debug-channel restore must NOT mistake that re-fetch for a cache
    // restore and trigger a spurious location.reload() — the live
    // WebSocket-backed channel already has the debug data for the fresh
    // response.
    //
    // Chromium-only because clearing the browser cache via the test harness
    // uses CDP, which Playwright only exposes for Chromium. The same exec-time
    // code path is exercised by Safari whenever its navigation entry's size
    // fields are still zero at script-execution time (the deferred-to-pageshow
    // branch), but the harness can't deterministically force the eviction
    // there.
    it('should recover via the live debug channel when the back-navigation target was evicted from the HTTP cache', async () => {
      const outputIndex = next.cliOutput.length
      // Use /streaming as the back-nav target so the body is still streaming
      // when our inline script reads PerformanceNavigationTiming — that forces
      // the deferred branch (encodedBodySize === 0 at exec).
      const browser = await next.browser('/streaming', {
        pushErrorAsConsoleLog: true,
      })

      await retry(async () => {
        expect(await browser.elementById('dynamic-content').text()).toBe(
          'Dynamic content'
        )
      })

      // Navigate forward via the layout's MPA link (full page navigation, not a
      // client-side transition).
      await browser.elementByCss('a[href="/target-page"]').click()
      expect(await (await browser.elementByCss('h2')).text()).toBe(
        'Target Page'
      )

      // Simulate cache eviction by clearing the browser HTTP cache via CDP.
      // With the cached body gone, the browser back-navigation falls back to a
      // fresh server fetch instead of an HTTP cache restore.
      await browser.clearBrowserCache()

      await browser.back()

      // The page should render the dynamic content without a spurious reload.
      await retry(async () => {
        expect(await browser.elementById('dynamic-content').text()).toBe(
          'Dynamic content'
        )
      })

      // '/streaming' should have been requested exactly twice: the initial
      // forward load and the back-navigation re-fetch. A third request
      // would indicate that the debug-channel restore mistook the re-fetch
      // for a cache restore and triggered a spurious location.reload().
      const output = next.cliOutput.slice(outputIndex)
      const counts: Record<string, number> = {}
      for (const [, path] of output.matchAll(
        /GET (\/(?:streaming|target-page)) /g
      )) {
        counts[path] = (counts[path] ?? 0) + 1
      }
      expect(counts).toEqual({ '/streaming': 2, '/target-page': 1 })

      await assertNoConsoleErrors(browser)
    })
  }
})

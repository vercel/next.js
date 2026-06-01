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

  if (
    // Persistence only exists in dev.
    isNextDev &&
    // TODO: Re-enable for node streams once the React debug channel integration
    // is fixed there. With `__NEXT_USE_NODE_STREAMS` the debug channel readable
    // doesn't close as expected, so the client never persists the buffered
    // entry and this test's wait-for-persisted step times out.
    !process.env.__NEXT_USE_NODE_STREAMS
  ) {
    it('should reload to recover when a debug channel entry was pruned by newer page loads', async () => {
      // The debug channel for the initial document is buffered and persisted to
      // IndexedDB so it can be restored when the browser serves the page from
      // the HTTP cache (back-forward navigation). Persistence is bounded to a
      // maximum number of entries, pruning the oldest on each write. This
      // verifies that an entry pushed out by newer page loads is no longer
      // restorable, so going back to it recovers via a full reload instead.

      // One past the persistence cap (MAX_ENTRIES = 10): loading the whole
      // chain writes 11 entries, pruning exactly the first page's entry and
      // leaving /purge/2..11 cached.
      const PAGES = 11

      // Snapshot the server output so we can count requests made during this
      // test. Recovery is observed through server requests rather than client
      // load events: a still-cached page is restored client-side from the HTTP
      // cache with no server request, while the pruned page misses and recovers
      // with a full reload, which is a fresh server request. Load-event counts
      // would be browser-dependent here, since some browsers fire the reload
      // before the back-navigation's own load event and some after.
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/purge/1')

      // Wait until the just-loaded page's debug channel has been durably
      // committed to IndexedDB before navigating away. Persistence is deferred
      // to an idle callback and its IndexedDB write is async; navigating before
      // it commits would abort the transaction and drop the entry. The page
      // sets a flag once the commit completes (test mode only), which resets
      // naturally on each navigation since every document gets a fresh window.
      const waitForPersisted = () =>
        retry(async () => {
          expect(
            await browser.eval(
              () => (self as any).__NEXT_DEBUG_CHANNEL_PERSISTED
            )
          ).toBe(true)
        })

      // Hard-navigate through the chain. Each load persists its own entry, so
      // after more than MAX_ENTRIES loads the earliest pages are pruned.
      for (let n = 1; n <= PAGES; n++) {
        await retry(async () => {
          expect(await browser.elementById(`purge-${n}`).text()).toBe(
            `Purge ${n}`
          )
        })
        await waitForPersisted()
        if (n < PAGES) {
          await browser.elementById('next').click()
        }
      }

      // Back-navigate the whole way to the first page. Each step restores the
      // page's HTML from the HTTP cache and re-runs the debug channel restore.
      for (let n = PAGES; n > 1; n--) {
        await browser.back()
        await retry(async () => {
          expect(await browser.elementById(`purge-${n - 1}`).text()).toBe(
            `Purge ${n - 1}`
          )
        })
      }

      // Per-page server request counts after the forward + back traversal.
      // /purge/1 reaches 2 requests in every browser but via different paths:
      //
      // Chrome and Firefox restore each back-navigation from the HTTP cache
      // (the HMR WebSocket disqualifies bfcache, so the browser falls back to
      // HTTP cache restore with no server request). /purge/2..10 stay at one
      // request because their IDB entries are still around and the restore
      // replays them silently. /purge/1's IDB entry was pruned by the time we
      // get back to it (MAX_ENTRIES=10), so its restore misses and recovers
      // via a single location.reload() — that's the second server request.
      //
      // Playwright's WebKit is encoded as a separate expectation because it
      // doesn't match real Safari behavior. Real Safari keeps recent pages in
      // bfcache and falls back to HTTP cache restore for evicted ones, so it
      // would behave like Chrome/Firefox here. Playwright's WebKit instead
      // re-fetches every back-navigation target from the server, which adds
      // one extra server request per back-step (including /purge/1 — the same
      // re-fetch behavior already accounts for its second request, so the
      // pruned IDB entry never triggers a reload there). The fresh re-fetch
      // is correctly classified as a non-cache-restore by debug-channel.ts
      // (the deferred-pageshow branch routes it to the live WebSocket-backed
      // channel), so no spurious reload follows.
      const isSafari = global.browserName === 'safari'
      await retry(async () => {
        const getCounts: Record<string, number> = {}
        const output = next.cliOutput.slice(outputIndex)
        for (const [, path] of output.matchAll(/GET (\/purge\/\d+) /g)) {
          getCounts[path] = (getCounts[path] ?? 0) + 1
        }
        expect(getCounts).toEqual({
          '/purge/1': 2,
          // Chrome/Firefox: 1 forward only (HTTP cache restore on back).
          // Safari (Playwright/WebKit): 1 forward + 1 back re-fetch = 2.
          '/purge/2': isSafari ? 2 : 1,
          '/purge/3': isSafari ? 2 : 1,
          '/purge/4': isSafari ? 2 : 1,
          '/purge/5': isSafari ? 2 : 1,
          '/purge/6': isSafari ? 2 : 1,
          '/purge/7': isSafari ? 2 : 1,
          '/purge/8': isSafari ? 2 : 1,
          '/purge/9': isSafari ? 2 : 1,
          '/purge/10': isSafari ? 2 : 1,
          '/purge/11': 1,
        })
      })
    })
  }
})

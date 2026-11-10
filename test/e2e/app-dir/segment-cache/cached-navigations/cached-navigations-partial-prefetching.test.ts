import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// The `partial-prefetching` fixture enables Partial Prefetching globally via
// the next-config `partialPrefetching: true`, which opts every route into
// runtime Cached Navigations even without a per-segment `prefetch` config.
// @force-gate !dev
describe('cached navigations - global partialPrefetching', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'partial-prefetching'),
  })

  it('runtime-caches a route that has no per-segment prefetch config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation to /runtime-prefetchable — a route that reads request
    // data but does NOT export any `prefetch` config. The link uses
    // prefetch={false}, so this is a plain navigation with no prefetch.
    await act(
      async () => {
        await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
      },
      { includes: 'Dynamic content' }
    )

    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Second navigation — under the global `partialPrefetching` config, the
    // request-derived content (searchParams, cookies, headers) was
    // runtime-cached from the first navigation and shows instantly, even with
    // the dynamic request blocked. Only the truly dynamic connection() content
    // needs a server request.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )
      expect(
        await browser.elementById('search-params-boundary').text()
      ).toContain('Search params:')
      expect(await browser.elementById('cookies-boundary').text()).toContain(
        'Cookie:'
      )
      expect(await browser.elementById('headers-boundary').text()).toContain(
        'Header:'
      )
      expect(await browser.elementById('navigation-boundary').text()).toContain(
        'Navigation content'
      )
      expect(await browser.elementById('prefetch-boundary').text()).toContain(
        'Prefetch content'
      )

      // Only connection() shows a Suspense fallback — it's truly dynamic.
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, the dynamic content resolves too.
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })

  it('cache values are consistent across the HTML shell, static prefetches, and cached navigations', async () => {
    const href = '/cache-from-rdc'
    const htmlId = 'cached-data'

    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal a link to the page. This should result in a static prefetch.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        `[data-prefetch="auto"] input[data-link-accordion="${href}"]`
      )
      await linkToggle.click()
    }, [
      {
        includes: 'cache-timestamp:',
        kind: 'static',
      },
    ])

    //===========================
    // Test client navigation
    //===========================

    // Navigate to the page.
    const cachedValueFromPrefetch = await act(async () => {
      await browser
        .elementByCss(`[data-prefetch="auto"] a[href="${href}"]`)
        .click()

      const cachedValueFromPrefetch = await browser.elementById(htmlId).text()
      return cachedValueFromPrefetch
    }, [{ includes: 'Navigation-only runtime data' }])

    expect(await browser.elementById('runtime-data').text()).toBe(
      'Navigation-only runtime data'
    )

    // The navigation response should also contain the same cache value.
    expect(await browser.elementById(htmlId).text()).toBe(
      cachedValueFromPrefetch
    )

    // Navigate back to the index page.
    await act(() => browser.elementByCss('a[href="/"]').click(), 'no-requests')
    // Then, navigate to the page again (without a prefetch).
    // All the UI is cacheable, so it should be re-used from the client
    // navigation, and we should navigate without any extra requests.
    await act(async () => {
      await browser
        .elementByCss(`[data-prefetch="false"] a[href="${href}"]`)
        .click()
    }, 'no-requests')

    expect(await browser.elementById('runtime-data').text()).toBe(
      'Navigation-only runtime data'
    )

    // The cached client navigation should have the same cache value.
    expect(await browser.elementById(htmlId).text()).toBe(
      cachedValueFromPrefetch
    )

    //===========================
    // Test initial load
    //===========================

    await browser.refresh()

    expect(await browser.elementById('runtime-data').text()).toBe(
      'Navigation-only runtime data'
    )
    // The initial load should have the same cache value.
    expect(await browser.elementById(htmlId).text()).toBe(
      cachedValueFromPrefetch
    )

    // Navigate to the index page.
    await act(() => browser.elementByCss('a[href="/"]').click())
    // Then, navigate back to the page without a prefetch.
    // All the UI is cacheable, so it should be re-used from the initial
    // load, and we should navigate without any extra requests.
    await act(async () => {
      await browser
        .elementByCss(`[data-prefetch="false"] a[href="${href}"]`)
        .click()
    }, 'no-requests')

    expect(await browser.elementById('runtime-data').text()).toBe(
      'Navigation-only runtime data'
    )

    // The cached navigation should have the same cache value.
    expect(await browser.elementById(htmlId).text()).toBe(
      cachedValueFromPrefetch
    )
  })
})

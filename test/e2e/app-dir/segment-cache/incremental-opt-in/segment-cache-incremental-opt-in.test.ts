import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

describe('segment cache (incremental opt in)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  async function testPrefetchDeduping(linkHref) {
    // This e2e test app is designed to verify that if you prefetch a link
    // multiple times, the prefetches are deduped by the client cache
    // (unless/until they become stale). It works by toggling the visibility of
    // the links and checking whether any prefetch requests are issued.
    //
    // Throughout the duration of the test, we collect all the prefetch requests
    // that occur. Then at the end we confirm there are no duplicates.
    const prefetches = new Map()
    const duplicatePrefetches = new Map()

    const interceptor = createRequestInterceptor()
    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.route('**/*', async (route: Playwright.Route) => {
          const prefetchInfo = await interceptor.checkPrefetch(route)
          if (prefetchInfo) {
            const key = JSON.stringify(prefetchInfo)
            if (prefetches.has(key)) {
              duplicatePrefetches.set(key, prefetchInfo)
            } else {
              prefetches.set(key, prefetchInfo)
            }
          }
          await interceptor.interceptRoute(page, route)
        })
      },
    })
    // Each link on the test page has a checkbox that controls its visibility.
    // It starts off as hidden.
    const checkbox = await browser.elementByCss(
      `input[data-link-accordion="${linkHref}"]`
    )
    // Confirm the checkbox is not checked
    expect(await checkbox.isChecked()).toBe(false)

    // Click the checkbox to reveal the link and trigger a prefetch
    await interceptor.waitForPrefetches(async () => {
      await checkbox.click()
      await browser.elementByCss(`a[href="${linkHref}"]`)
    })

    // Toggle the visibility of the link. Prefetches are initiated on viewport,
    // so if the cache does not dedupe then properly, this test will detect it.
    await checkbox.click() // hide
    await checkbox.click() // show
    const link = await browser.elementByCss(`a[href="${linkHref}"]`)

    // Navigate to the target link
    await link.click()

    // Confirm the navigation happened
    await browser.elementById('page-content')
    expect(new URL(await browser.url()).pathname).toBe(linkHref)

    // Finally, assert there were no duplicate prefetches
    expect(duplicatePrefetches.size).toBe(0)
  }

  describe('multiple prefetches to same link are deduped', () => {
    it('page with PPR enabled', () => testPrefetchDeduping('/ppr-enabled'))
    it('page with PPR enabled, and has a dynamic param', () =>
      testPrefetchDeduping('/ppr-enabled/dynamic-param'))
    it('page with PPR disabled', () => testPrefetchDeduping('/ppr-disabled'))
    it('page with PPR disabled, and has a loading boundary', () =>
      testPrefetchDeduping('/ppr-disabled-with-loading-boundary'))
  })
})

function createRequestInterceptor() {
  // Test utility for intercepting internal RSC requests so we can control the
  // timing of when they resolve. We want to avoid relying on internals and
  // implementation details as much as possible, so the only thing this does
  // for now is let you block and release requests from happening based on
  // their type (prefetch requests, navigation requests).
  let prefetchesPromise: PromiseWithResolvers<void> = null
  let lastPrefetchRequest: Playwright.Request | null = null

  async function checkPrefetch(route: Playwright.Route): Promise<{
    href: string
    segment: string | null
    base: string | null
  } | null> {
    const request = route.request()
    const requestHeaders = await request.allHeaders()
    if (
      requestHeaders['RSC'.toLowerCase()] &&
      requestHeaders['Next-Router-Prefetch'.toLowerCase()]
    ) {
      return {
        href: new URL(request.url()).pathname,
        segment: requestHeaders['Next-Router-Segment-Prefetch'.toLowerCase()],
        base: requestHeaders['Next-Router-State-Tree'.toLowerCase()] ?? null,
      }
    }
    return null
  }

  return {
    checkPrefetch,

    /**
     * Waits for the next for the next prefetch request, then keeps waiting
     * until the prefetch queue is empty (to account for network throttling).
     *
     * If no prefetches are initiated, this will timeout.
     */
    async waitForPrefetches<T>(
      scope: () => Promise<T> | T = (): undefined => {}
    ): Promise<T> {
      if (prefetchesPromise === null) {
        let resolve
        let reject
        const promise: Promise<void> = new Promise((res, rej) => {
          resolve = res
          reject = rej
        })
        prefetchesPromise = {
          resolve,
          reject,
          promise,
        }
      }
      const result = await scope()
      if (prefetchesPromise !== null) {
        await prefetchesPromise.promise
      }
      return result
    },

    async interceptRoute(page: Playwright.Page, route: Playwright.Route) {
      const request = route.request()
      const requestHeaders = await request.allHeaders()

      if (requestHeaders['RSC'.toLowerCase()]) {
        // This is an RSC request. Check if it's a prefetch or a navigation.
        if (requestHeaders['Next-Router-Prefetch'.toLowerCase()]) {
          // This is a prefetch request.
          if (prefetchesPromise !== null) {
            // Wait for the prefetch response to finish, then wait an additional
            // async task for additional prefetches to be initiated.
            lastPrefetchRequest = request
            const waitForMorePrefetches = async () => {
              const inBrowserResponse = await request.response()
              await inBrowserResponse.finished()

              await page.evaluate(
                () =>
                  // If the prefetch queue is network throttled, the next
                  // request should be issued within a microtask of the previous
                  // one finishing.
                  new Promise<void>((res) => requestIdleCallback(() => res()))
              )
              if (request === lastPrefetchRequest) {
                // No further prefetches were initiated. Assume the prefetch
                // queue is now empty.
                prefetchesPromise.resolve()
                prefetchesPromise = null
                lastPrefetchRequest = null
              }
            }
            const response = await page.request.fetch(route.request())
            const responseText = await response.text()
            await route.fulfill({
              body: responseText,
              headers: response.headers(),
            })
            waitForMorePrefetches().then(
              () => {},
              () => {}
            )
            return
          }
        } else {
          // This is a navigation request.
        }
      }

      await route.continue()
    },
  }
}

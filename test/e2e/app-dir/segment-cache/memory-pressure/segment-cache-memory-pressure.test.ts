import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

describe('segment cache memory pressure', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('disabled in development / deployment', () => {})
    return
  }

  it('evicts least recently used prefetch data once cache size exceeds limit', async () => {
    const interceptor = createRequestInterceptor()

    // Loading the page triggers a prefetch of the first link.
    const browser = await interceptor.waitForPrefetches(() =>
      next.browser('/memory-pressure', {
        beforePageLoad(page: Playwright.Page) {
          page.route('**/*', async (route: Playwright.Route) => {
            await interceptor.interceptRoute(page, route)
          })
        },
      })
    )

    const switchToTab1 = await browser.elementByCss(
      'input[type="radio"][value="1"]'
    )
    const switchToTab2 = await browser.elementByCss(
      'input[type="radio"][value="2"]'
    )

    // Switching to tab 2 causes the cache to overflow, evicting the prefetch
    // for the link on tab 1.
    await interceptor.waitForPrefetches(async () => {
      await switchToTab2.click()
    })

    // Switching back to tab 1 initiates a new prefetch for the first link.
    // Otherwise, this will timeout.
    await interceptor.waitForPrefetches(async () => {
      await switchToTab1.click()
    })
  })
})

function createRequestInterceptor() {
  // Test utility for intercepting internal RSC requests so we can control the
  // timing of when they resolve. We want to avoid relying on internals and
  // implementation details as much as possible, so the only thing this does
  // for now is let you block and release requests from happening based on
  // their type (prefetch requests, navigation requests).
  let pendingPrefetches: Set<Playwright.Route> | null = null
  let pendingNavigations: Set<Playwright.Route> | null = null

  let prefetchesPromise: PromiseWithResolvers<void> = null
  let lastPrefetchRequest: Playwright.Request | null = null

  return {
    lockNavigations() {
      if (pendingNavigations !== null) {
        throw new Error('Navigations are already locked')
      }
      pendingNavigations = new Set()
      return {
        async release() {
          if (pendingNavigations === null) {
            throw new Error('This lock was already released')
          }
          const routes = pendingNavigations
          pendingNavigations = null
          for (const route of routes) {
            route.continue()
          }
        },
      }
    },

    lockPrefetches() {
      if (pendingPrefetches !== null) {
        throw new Error('Prefetches are already locked')
      }
      pendingPrefetches = new Set()
      return {
        release() {
          if (pendingPrefetches === null) {
            throw new Error('This lock was already released')
          }
          const routes = pendingPrefetches
          pendingPrefetches = null
          for (const route of routes) {
            route.continue()
          }
        },
      }
    },

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
              const response = await request.response()
              await response.finished()
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
            waitForMorePrefetches().then(
              () => {},
              () => {}
            )
          }
          if (pendingPrefetches !== null) {
            pendingPrefetches.add(route)
            return
          }
        } else {
          // This is a navigation request.
          if (pendingNavigations !== null) {
            pendingNavigations.add(route)
            return
          }
        }
      }

      await route.continue()
    },
  }
}

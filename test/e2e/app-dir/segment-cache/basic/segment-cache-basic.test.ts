import { nextTestSetup } from 'e2e-utils'
import type { Page, Route } from 'playwright'

describe('segment cache (basic tests)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  it('navigate before any data has loaded into the prefetch cache', async () => {
    // Before loading the page, block all prefetch requests from resolving so
    // we can simulate what happens during a navigation if the cache does not
    // have a matching prefetch entry.
    const interceptor = createRequestInterceptor()
    const prefetchLock = interceptor.lockPrefetches()

    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        page.route('**/*', async (route: Route) => {
          await interceptor.interceptRoute(route)
        })
      },
    })

    // Navigate to the test page
    const link = await browser.elementByCss('a')
    await link.click()

    // The static and dynamic content appears simultaneously because everything
    // was fetched as part of the same navigation request.
    const nav = await browser.elementById('nav')
    expect(await nav.innerHTML()).toMatchInlineSnapshot(
      `"<div><div data-streaming-text-static="Static in nav">Static in nav</div><div data-streaming-text-dynamic="Dynamic in nav">Dynamic in nav</div></div>"`
    )

    await prefetchLock.release()
  })

  it('navigate with prefetched data', async () => {
    const interceptor = createRequestInterceptor()
    const browser = await next.browser('/', {
      beforePageLoad(page: Page) {
        page.route('**/*', async (route: Route) => {
          await interceptor.interceptRoute(route)
        })
      },
    })

    // Rendering the link triggers a prefetch of the test page.
    const link = await browser.elementByCss('a')

    // Before navigating to the test page, block all navigation requests from
    // resolving so we can simulate what happens on a slow connection when
    // the cache has been populated with prefetched data.
    const navigationsLock = interceptor.lockNavigations()

    // Navigate to the test page
    await link.click()

    // Even though the navigation is blocked, we're able to immediately render
    // the static content because it was prefetched.
    const nav = await browser.elementById('nav')
    expect(await nav.innerHTML()).toMatchInlineSnapshot(
      `"<div><div data-streaming-text-static="Static in nav">Static in nav</div><div>Loading... [Dynamic in nav]</div></div>"`
    )

    // Unblocking the navigation request causes the dynamic content to
    // stream in.
    await navigationsLock.release()
    await browser.elementByCss('[data-streaming-text-dynamic="Dynamic in nav"]')
    expect(await nav.innerHTML()).toMatchInlineSnapshot(
      `"<div><div data-streaming-text-static="Static in nav">Static in nav</div><div data-streaming-text-dynamic="Dynamic in nav">Dynamic in nav</div></div>"`
    )
  })
})

function createRequestInterceptor() {
  // Test utility for intercepting internal RSC requests so we can control the
  // timing of when they resolve. We want to avoid relying on internals and
  // implementation details as much as possible, so the only thing this does
  // for now is let you block and release requests from happening based on
  // their type (prefetch requests, navigation requests).
  let pendingPrefetches: Set<Route> | null = null
  let pendingNavigations: Set<Route> | null = null

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

    async interceptRoute(route: Route) {
      const requestHeaders = await route.request().allHeaders()

      if (requestHeaders['RSC'.toLowerCase()]) {
        // This is an RSC request. Check if it's a prefetch or a navigation.
        if (requestHeaders['Next-Router-Prefetch'.toLowerCase()]) {
          // This is a prefetch request.
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

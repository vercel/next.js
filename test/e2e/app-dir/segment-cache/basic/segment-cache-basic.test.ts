import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

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
      beforePageLoad(page: Playwright.Page) {
        page.route('**/*', async (route: Playwright.Route) => {
          await interceptor.interceptRoute(page, route)
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
      beforePageLoad(page: Playwright.Page) {
        page.route('**/*', async (route: Playwright.Route) => {
          await interceptor.interceptRoute(page, route)
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

  it('navigate to page with lazily-generated (not at build time) static param', async () => {
    const interceptor = createRequestInterceptor()
    const browser = await interceptor.waitForPrefetches(async () => {
      const b = await next.browser('/lazily-generated-params', {
        beforePageLoad(page: Playwright.Page) {
          page.route('**/*', async (route: Playwright.Route) => {
            await interceptor.interceptRoute(page, route)
          })
        },
      })
      await b.elementByCss('a')
      return b
    })

    const navigationsLock = interceptor.lockNavigations()

    // Navigate to the test page
    const link = await browser.elementByCss('a')
    await link.click()

    // We should be able to render the page with the dynamic param, because
    // it is lazily generated
    const target = await browser.elementById(
      'target-page-with-lazily-generated-param'
    )
    expect(await target.innerHTML()).toMatchInlineSnapshot(
      `"Param: some-param-value"`
    )

    await navigationsLock.release()

    // TODO: Once #73540 lands we can also test that the dynamic nav was skipped
    // const navigations = await navigationsLock.release()
    // expect(navigations.size).toBe(0)
  })

  it('prefetch interception route', async () => {
    const interceptor = createRequestInterceptor()
    const browser = await next.browser('/interception/feed', {
      beforePageLoad(page: Playwright.Page) {
        page.route('**/*', async (route: Playwright.Route) => {
          await interceptor.interceptRoute(page, route)
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

    // The page should render immediately because it was prefetched
    const div = await browser.elementById('intercepted-photo-page')
    expect(await div.innerHTML()).toBe('Intercepted photo page')

    navigationsLock.release()
  })

  it('skips dynamic request if prefetched data is fully static', async () => {
    const interceptor = createRequestInterceptor()
    const browser = await next.browser('/fully-static', {
      beforePageLoad(page: Playwright.Page) {
        page.route('**/*', async (route: Playwright.Route) => {
          await interceptor.interceptRoute(page, route)
        })
      },
    })

    // Rendering the link triggers a prefetch of the test page.
    const link = await browser.elementByCss(
      'a[href="/fully-static/target-page"]'
    )
    const navigationsLock = interceptor.lockNavigations()
    await link.click()

    // The page should render immediately because it was prefetched.
    const div = await browser.elementById('target-page')
    expect(await div.innerHTML()).toBe('Target')

    // We should have skipped the navigation request because all the data was
    // fully static.
    const numberOfNavigationRequests = (await navigationsLock.release()).size
    expect(numberOfNavigationRequests).toBe(0)
  })

  it('skips static layouts during partially static navigation', async () => {
    const interceptor = createRequestInterceptor()
    let page: Playwright.Page
    const browser = await next.browser('/partially-static', {
      beforePageLoad(p: Playwright.Page) {
        page = p
        page.route('**/*', async (route: Playwright.Route) => {
          await interceptor.interceptRoute(page, route)
        })
      },
    })

    // Rendering the link triggers a prefetch of the test page.
    const link = await browser.elementByCss(
      'a[href="/partially-static/target-page"]'
    )
    const navigationsLock = interceptor.lockNavigations()
    await link.click()

    // The static layout and the loading state of the dynamic page should render
    // immediately because they were prefetched.
    const layoutMarkerId = 'static-layout'
    const layoutMarker = await browser.elementById(layoutMarkerId)
    const layoutMarkerContent = await layoutMarker.innerHTML()
    expect(layoutMarkerContent).toBe('Static layout')
    const dynamicDiv = await browser.elementById('dynamic-page')
    expect(await dynamicDiv.innerHTML()).toBe('Loading...')

    // Unblock the navigation request to allow the dynamic content to stream in.
    const navigationRoutes = await navigationsLock.release()

    // Check that the navigation response does not include the static layout,
    // since it was already prefetched. Because this is not observable in the
    // UI, we check the navigation response body.
    const numberOfNavigationRequests = navigationRoutes.size
    expect(numberOfNavigationRequests).toBe(1)
    for (const route of navigationRoutes) {
      const response = await page.request.fetch(route.request())
      const responseText = await response.text()
      expect(responseText).not.toContain(layoutMarkerId)
      expect(responseText).not.toContain(layoutMarkerContent)
    }

    // The dynamic content has streamed in.
    expect(await dynamicDiv.innerHTML()).toBe('Dynamic page')
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
          return routes
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
          return routes
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

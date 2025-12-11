import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

describe('prefetch inflight duplicate request', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped in dev because there are no prefetches', () => {})
    return
  }

  it('should not make duplicate RSC request when navigation happens during inflight prefetch', async () => {
    const rscRequests = new Map<string, number>()
    const prefetchRequests = new Map<string, number>()
    let resolvePrefetchRequest: (() => void) | null = null
    let prefetchRequestStarted = false

    const browser = await next.browser('/', {
      beforePageLoad(page: Playwright.Page) {
        page.route('**/search**', async (route) => {
          const request = route.request()
          const headers = await request.allHeaders()
          const url = new URL(request.url())
          const pathname = url.pathname

          // Track RSC requests (non-prefetch requests)
          if (headers['rsc'] === '1' && !headers['next-router-prefetch']) {
            const count = rscRequests.get(pathname) || 0
            rscRequests.set(pathname, count + 1)

            if (rscRequests.get(pathname)! > 1) {
              throw new Error(
                `Duplicate RSC request detected for ${pathname}. Expected only one request.`
              )
            }

            // If this is the first RSC request and prefetch is already in progress,
            // this means we're making a duplicate request
            if (prefetchRequestStarted) {
              throw new Error(
                `RSC request made while prefetch is still inflight for ${pathname}`
              )
            }

            await route.continue()
          } else if (
            headers['rsc'] === '1' &&
            headers['next-router-prefetch'] === '1'
          ) {
            // This is a prefetch request - track it and stall it to simulate slow network
            const count = prefetchRequests.get(pathname) || 0
            prefetchRequests.set(pathname, count + 1)
            prefetchRequestStarted = true

            let resolvePromise: () => void
            const promise = new Promise<void>((res) => {
              resolvePromise = res
            })

            resolvePrefetchRequest = async () => {
              await route.continue()
              // Wait a moment to ensure the response is received
              await new Promise((res) => setTimeout(res, 100))
              resolvePromise()
            }

            // Await the promise to effectively stall the prefetch request
            await promise
          } else {
            await route.continue()
          }
        })
      },
    })

    // Wait for page to load
    await browser.waitForElementByCss('#search-link')

    // Start prefetch by hovering over the link
    const link = await browser.elementByCss('#search-link')
    await link.hover()

    // Wait a bit to ensure prefetch request has started
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Now quickly click the link while prefetch is still inflight
    // This should wait for the prefetch to complete instead of making a new request
    await link.click()

    // Wait a bit to ensure any requests would have been made
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Resolve the prefetch request
    if (resolvePrefetchRequest) {
      await resolvePrefetchRequest()
    }

    // Wait for navigation to complete
    await browser.waitForElementByCss('#search-content')

    // Verify that a prefetch request was made
    const prefetchRequestCount = prefetchRequests.get('/search') || 0
    expect(prefetchRequestCount).toBeGreaterThan(0)

    // Verify that no RSC request (non-prefetch) was made during navigation
    // The navigation should have used the prefetch data instead of making a new request
    const rscRequestCount = rscRequests.get('/search') || 0
    expect(rscRequestCount).toBe(0)
  })
})

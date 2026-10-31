import { nextTestSetup } from 'e2e-utils'

// Regression test for https://github.com/vercel/next.js/issues/100968
// A soft navigation must commit (and show loading.js) promptly even when the
// target's segment prefetch is still in flight. The navigation must not wait
// for the prefetch to resolve.
describe('navigation-in-flight-prefetch-loading', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped in dev because prefetches behave differently', () => {})
    return
  }

  it('shows loading.js immediately when the target prefetch is in flight', async () => {
    let releaseSegmentPrefetch: (() => void) | null = null
    let segmentPrefetchInFlightResolve: (() => void) | null = null
    const segmentPrefetchInFlight = new Promise<void>((resolve) => {
      segmentPrefetchInFlightResolve = resolve
    })

    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.route('**/target**', async (route) => {
          const request = route.request()
          const headers = await request.allHeaders()
          const isPrefetch = 'next-router-prefetch' in headers
          const segmentPath = headers['next-router-segment-prefetch']

          if (isPrefetch && segmentPath !== '/_tree') {
            // Hold the segment-data prefetch (which carries the head) until
            // the test has asserted that loading.js is shown. The /_tree
            // prefetch goes through so the route tree is cached and the
            // router takes the soft-navigation path. Navigation requests
            // (no prefetch header) are never delayed.
            segmentPrefetchInFlightResolve?.()
            await new Promise<void>((resolve) => {
              releaseSegmentPrefetch = resolve
            })
          }
          await route.continue()
        })
      },
    })

    // Wait until the segment prefetch for /target is in flight, then click
    // while it is still pending.
    await segmentPrefetchInFlight
    await browser.elementById('to-target').click()

    // loading.js must appear promptly, long before the held prefetch resolves.
    await browser.waitForElementByCss('#target-loading', 5000)

    // Release the prefetch and let the navigation finish.
    releaseSegmentPrefetch?.()
    await browser.waitForElementByCss('#target-content', 10000)

    await browser.close()
  })
})

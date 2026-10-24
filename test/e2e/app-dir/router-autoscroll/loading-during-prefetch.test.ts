import { nextTestSetup } from 'e2e-utils'

// Regression test for navigating while the target's loading-boundary prefetch
// is still in flight (the cause of intermittent failures in
// router-autoscroll.test.ts › "Should apply scroll when loading.js is used").
//
// Clicking the off-screen link scrolls it into view, which starts the link's
// loading-boundary prefetch together with the navigation, and the navigation
// reads the prefetch's Pending segment entries. The prefetch used to spawn a
// Pending entry for `__PAGE__` too, even though it's below
// `loading-scroll/loading.tsx` and the server never renders it in that
// response. The response then rejected it, the navigation's prefetch data for
// `__PAGE__` resolved to `null`, and the page rendered as an empty segment
// instead of suspending into `loading.js`. It stayed blank until the dynamic
// response finished (~5s). The scheduler now only spawns entries for segments
// at or above a loading boundary (#99706).
//
// This test forces the ordering that exposed it: the navigation request is
// held until the loading-boundary prefetch has been issued (so its entries are
// Pending), then the navigation's own response arrives first and the prefetch
// lands later. Even with that ordering the outcome depends on React
// scheduling, so it's repeated.
const ITERATIONS = 10
const PREFETCH_DELAY_MS = 500

// There's no prefetching in dev, and Cache Components uses per-segment
// prefetches instead of the loading-boundary prefetch, so this ordering only
// exists in production without Cache Components.
// @force-gate !dev
// @force-gate !cacheComponents
describe('router autoscroll - loading.js during an in-flight prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  for (let i = 0; i < ITERATIONS; i++) {
    it(`shows loading.js when the prefetch lands after the navigation response (#${i})`, async () => {
      let releasePrefetch: () => void = () => {}
      const prefetchHeld = new Promise<void>((r) => (releasePrefetch = r))
      let onPrefetchIssued: () => void = () => {}
      const prefetchIssued = new Promise<void>((r) => (onPrefetchIssued = r))

      const browser = await next.browser('/', {
        async beforePageLoad(page) {
          await page.route(
            (url) => url.pathname === '/loading-scroll',
            async (route) => {
              const headers = route.request().headers()
              if (headers['rsc'] && !headers['next-router-prefetch']) {
                // The navigation request: send it only once the
                // loading-boundary prefetch is in flight.
                await prefetchIssued
                await route.continue()
                // Let the navigation response arrive first, then release
                // the prefetch.
                setTimeout(releasePrefetch, PREFETCH_DELAY_MS)
                return
              }
              // Hold the loading-boundary prefetch: a prefetch that isn't a
              // per-segment (`/_tree`) request.
              if (
                headers['next-router-prefetch'] &&
                headers['next-router-segment-prefetch'] === undefined
              ) {
                onPrefetchIssued()
                await prefetchHeld
              }
              await route.continue()
            }
          )
        },
      })
      await browser.eval('window.scrollTo(0, 500)')
      await browser.elementByCss('#to-loading-scroll').click()
      await Promise.race([
        prefetchIssued,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('loading-boundary prefetch was not issued')),
            5000
          )
        ),
      ])
      // The page sleeps for 5s, so the loading state must appear well before.
      await browser.waitForElementByCss('#loading-component', 3000)
    })
  }
})

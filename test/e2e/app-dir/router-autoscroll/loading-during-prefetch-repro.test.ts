import { nextTestSetup } from 'e2e-utils'

// Stress repro for the canary flake in
// router-autoscroll.test.ts › "Should apply scroll when loading.js is used".
//
// Clicking the link scrolls it into view, which starts the link's
// loading-boundary prefetch at about the same time as the navigation. When the
// navigation is seeded while that prefetch is still in flight, the page
// segment's prefetch placeholder can resolve to `null` and render as empty
// content instead of suspending, so `loading.js` is never shown and the page
// stays blank until the dynamic response finishes (~5s). The race is
// timing-dependent, so the scenario is repeated.
//
// See https://github.com/vercel/next.js/pull/99829 for the fix.
const ITERATIONS = 25

describe('router autoscroll - loading.js during in-flight prefetch', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // There's no prefetching in dev, so the race can't happen.
    it('is skipped in dev', () => {})
    return
  }

  for (let i = 0; i < ITERATIONS; i++) {
    it(`shows loading.js when navigating while the prefetch is in flight (#${i})`, async () => {
      const browser = await next.browser('/')
      await browser.eval('window.scrollTo(0, 500)')
      await browser.elementByCss('#to-loading-scroll').click()
      // The page sleeps for 5s, so the loading state must appear well before.
      await browser.waitForElementByCss('#loading-component', 4000)
    })
  }
})

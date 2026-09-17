import { nextTestSetup } from 'e2e-utils'

describe('use-cache-remote-build-seeding', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // Characterizes current behavior, not intended behavior: a remote cache
  // entry seeded during `next build` does not survive into runtime today.
  // When build seeding for remote caches is implemented, the production
  // expectation flips to `toBe`.
  it('characterizes whether the build-time seeded remote cache entry reaches runtime', async () => {
    // The static page is prerendered during `next build`, which fills the
    // shared 'use cache: remote' entry. A browser visit (MPA, no client-side
    // navigation) so that resumed segments are streamed in before reading.
    const staticBrowser = await next.browser('/static')
    const seededDate = await staticBrowser.elementByCss('#cached-date').text()
    expect(seededDate).toBeTruthy()

    // The dynamic page renders per request (behind `connection()`), so it can
    // only show the same value if the seeded entry is visible at runtime.
    const dynamicBrowser = await next.browser('/dynamic')
    const dynamicDate = await dynamicBrowser.elementByCss('#cached-date').text()

    if (isNextDev) {
      // Dev has no build step; the first visit fills the dev server's shared
      // in-memory handler and the dynamic page reuses it.
      expect(dynamicDate).toBe(seededDate)
    } else {
      // The built-in remote handler is per-process, so the build's fill is
      // gone when the server starts and the dynamic page regenerates.
      expect(dynamicDate).not.toBe(seededDate)
    }
  })
})

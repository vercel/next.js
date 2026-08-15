import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Route cache entries are keyed without the hash (`createCacheKey` only reads
// pathname and search), so one entry is shared across every hash of a route.
// A same-route navigation rebuilds the address by appending the incoming hash
// to the entry's stored canonical URL:
//
//   segment-cache/navigation.ts
//   const canonicalUrl = route.canonicalUrl + url.hash
//
// That makes "the stored canonical URL is hashless" an invariant every writer
// of `RouteCacheEntry.canonicalUrl` has to uphold. When a writer stores a
// hash-ful URL instead, the entry is poisoned: a later navigation that clears
// the hash gets it restored, and a later navigation to a different hash gets
// two of them.
//
// `AppRouterState.canonicalUrl` is the opposite — it drives `history.pushState`
// and must keep the hash. Both are plain strings, which is why this class of
// bug keeps recurring.
describe('hash canonical url', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  type Browser = Awaited<ReturnType<typeof next.browser>>

  async function currentUrl(browser: Browser) {
    return new URL(await browser.url())
  }

  // Route prediction and prefetching are disabled in dev, so the poisoned
  // entries these tests depend on are never read back.
  if (isNextDev) {
    it('skipped in dev mode', () => {})
    return
  }

  describe('initial load seeds the route cache (create-initial-router-state.ts)', () => {
    // `createInitialRouterState` passes `createHrefFromUrl(location)` to
    // `discoverKnownRoute`, which keeps `location.hash`.
    // https://github.com/vercel/next.js/issues/96714
    it('should clear the hash on replace after a direct entry with a hash', async () => {
      const browser = await next.browser('/initial/123#modal')
      await browser.waitForElementByCss('#initial')

      await browser.elementById('replace-without-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/initial/123')
        expect(url.hash).toBe('')
      })
    })

    // The same poisoned entry seen from the other side: instead of clearing the
    // hash, navigate to a different one. `route.canonicalUrl + url.hash`
    // concatenates onto the stale hash rather than replacing it.
    it('should not produce a double fragment on push after a direct entry with a hash', async () => {
      const browser = await next.browser('/initial/123#modal')
      await browser.waitForElementByCss('#initial')

      await browser.elementById('push-other-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/initial/123')
        expect(url.hash).toBe('#other')
      })
    })
  })

  describe('server actions seed the route cache (server-action-reducer.ts)', () => {
    // `redirectUrl` falls back to `new URL(state.canonicalUrl)` when the action
    // did not redirect, so it carries the current hash. The same string is then
    // used for both `discoverKnownRoute` (needs hashless) and
    // `navigateToKnownRoute` (needs the hash).
    //
    // The page is reached by client navigation, which seeds a correct hashless
    // entry, so the action is the only thing that can poison it.
    it('should clear the hash on replace after a revalidating action', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-action').click()
      await browser.waitForElementByCss('#action')

      await browser.elementById('run-revalidate').click()

      // The action itself must not change the address.
      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/action/123')
        expect(url.hash).toBe('#modal')
      })

      await browser.elementById('replace-without-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/action/123')
        expect(url.hash).toBe('')
      })
    })

    it('should not produce a double fragment on push after a revalidating action', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-action').click()
      await browser.waitForElementByCss('#action')

      await browser.elementById('run-revalidate').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.hash).toBe('#modal')
      })

      await browser.elementById('push-other-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/action/123')
        expect(url.hash).toBe('#other')
      })
    })

    // The mirror image of the same conflation: the href handed to
    // `RedirectBoundary` is built with `createHrefFromUrl(redirectLocation,
    // false)`, which drops a hash the action explicitly asked for.
    it('should keep the hash of a redirect issued by an action', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-action').click()
      await browser.waitForElementByCss('#action')

      await browser.elementById('run-redirect-with-hash').click()
      await browser.waitForElementByCss('#redirect-target')

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/redirect-target')
        expect(url.hash).toBe('#section')
      })
    })
  })

  describe('prefetch seeds the route cache (cache.ts)', () => {
    // `fetchRouteOnCacheMiss` rebuilds its request URL from the cache key
    // (`new URL(pathname + search, origin)`), which has already dropped the
    // hash, and `Response.url` never carries a fragment. So this path is
    // already correct — but nothing states or enforces it, and it writes to
    // the same field as the two above. Guard it.
    it('should clear the hash on replace after arriving via a prefetched link', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-prefetch').click()
      await browser.waitForElementByCss('#prefetch')

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.hash).toBe('#modal')
      })

      await browser.elementById('replace-without-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/prefetch/123')
        expect(url.hash).toBe('')
      })
    })
  })
})

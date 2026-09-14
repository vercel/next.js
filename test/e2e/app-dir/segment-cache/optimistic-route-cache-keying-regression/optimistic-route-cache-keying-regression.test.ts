import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('optimistic routing - route cache keying regression', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  // Regression test for https://github.com/vercel/next.js/pull/88863
  //
  // When navigating to a route that was not previously prefetched (e.g. via
  // a Link with prefetch={false}, or router.push()), the client creates a
  // route cache entry from the server response so it can be reused by future
  // navigations and prefetches to the same URL.
  //
  // A bug caused these entries to be stored with an incorrect cache key: the
  // "nextUrl" dimension (which tracks the referring page for interception
  // route purposes) was always set to null, even though the rest of the
  // system uses the real nextUrl value when looking up entries. This meant
  // every subsequent cache lookup missed, and the client would make
  // redundant requests for route data it already had.
  //
  // To reproduce:
  //
  //   1. Navigate to a dynamic page via a non-prefetched link. The client
  //      receives the route tree and segment data from the server and stores
  //      them in the cache.
  //
  //   2. Navigate back to the original page.
  //
  //   3. Reveal a prefetched link pointing to the same URL from step 1. The
  //      prefetch system should find the route tree and segment data already
  //      in the cache — no new network requests needed.
  //
  // Without the fix, step 3 triggers a redundant route tree prefetch because
  // the cache lookup misses due to the key mismatch.
  //
  // NOTE: This test relies on the staleTimes.dynamic config to keep route
  // cache entries alive across navigations. This is necessary because the
  // client segment cache currently only writes segment data during
  // prefetches, not during navigations — with the exception of the stale
  // times feature, which preserves entries for reuse. Once the client cache
  // writes segment data during navigations more broadly, this test could be
  // rewritten using a more idiomatic pattern without the staleTimes config.
  //
  // The target page calls connection() to opt into dynamic rendering, which
  // is what makes the staleTimes.dynamic config relevant (static pages use a
  // different, longer stale time that would mask the bug).
  it('regression: route cache entries from navigation are reusable by subsequent prefetches', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/feed', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Navigate to the photo page. This link has prefetch={false}, so the
    // client has no cached data for this route. It fetches the route tree
    // and page data from the server in a single request, then stores both
    // in the cache for future use.
    const unprefetchedLink = await browser.elementByCss('#link-no-prefetch')
    await act(async () => {
      await unprefetchedLink.click()
    })
    const photoPage = await browser.elementById('photo-page')
    expect(await photoPage.text()).toBe('Photo 1')

    // Navigate back to the feed page.
    const backLink = await browser.elementByCss('#link-back-to-feed')
    await backLink.click()
    await browser.elementByCss('#feed-page')

    // Reveal a prefetched link to the same photo page. This triggers the
    // prefetch system to look up the route cache. If the entry from the
    // first navigation was stored correctly, the prefetch finds it (along
    // with the segment data in the back/forward cache) and no network
    // requests are needed. If the cache key was wrong, this would trigger
    // a redundant route tree prefetch.
    await act(async () => {
      const reveal = await browser.elementByCss(
        'input[data-link-accordion="/photo/1"]'
      )
      await reveal.click()
    }, 'no-requests')

    // Navigate using the now-prefetched link. The page should render
    // immediately from the cache.
    const prefetchedLink = await browser.elementByCss('a[href="/photo/1"]')
    await act(async () => {
      await prefetchedLink.click()
      const page = await browser.elementById('photo-page')
      expect(await page.text()).toBe('Photo 1')
    }, 'no-requests')
  })
})

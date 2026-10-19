import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// Tests prefetch inlining with maxSize and maxBundleSize set to Infinity,
// which inlines all segments into a single response per route. This
// approximates the behavior of pre-Segment Cache (pre-Next 16) prefetching,
// where all prefetch data was bundled into one response. The tradeoff is that
// you lose the benefits of per-layout deduplication across routes.
//
// This is a special case of the general prefetch inlining feature tested in
// the sibling `prefetch-inlining` directory. We may consolidate these tests
// in the future.
describe('max prefetch inlining', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('disabled in development', () => {})
    return
  }

  it('bundles all segment data into a single request per route', async () => {
    // The test app has two routes that are 5 segments deep:
    //   /shared/a/b/c  and  /shared/a/d/e
    // Without inlining, prefetching each route would issue one request per
    // segment plus one for the head (6+ requests). With inlining enabled,
    // all segment data is bundled into a single response. Under App Shells a
    // route is prefetched in two phases (App Shell + per-link), and each phase
    // may issue a /_tree request plus an inlined segment-data request, so
    // revealing a link produces at most 4 prefetch requests per route — still
    // far fewer than the un-inlined per-segment requests.

    let rscRequestCount = 0
    let page: Playwright.Page

    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
        p.on('request', (request: Playwright.Request) => {
          if (request.headers()['rsc']) {
            rscRequestCount++
          }
        })
      },
    })
    const act = createRouterAct(page!)

    // Reveal the first link to trigger a prefetch of /shared/a/b/c
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/shared/a/b/c"]')
          .click()
      },
      {
        includes: 'Page C',
      }
    )

    // Snapshot the request count before revealing the second link
    const countBeforeSecondPrefetch = rscRequestCount

    // Reveal the second link to trigger a prefetch of /shared/a/d/e
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/shared/a/d/e"]')
          .click()
      },
      {
        includes: 'Page E',
      }
    )

    // The delta counts raw `rsc` requests via the listener above (NOT through
    // `act`, which ignores App Shell requests), so it includes the App Shell
    // prefetch as well as the per-link prefetch. Each may issue a /_tree request
    // plus an inlined segment-data request, so the delta is at most 4. Without
    // inlining there would be 6+ individual segment requests.
    const delta = rscRequestCount - countBeforeSecondPrefetch
    expect(delta).toBeLessThanOrEqual(4)

    // Navigate to the second route. Because the data was fully prefetched,
    // there should be no additional requests.
    await act(async () => {
      await browser.elementByCss('a[href="/shared/a/d/e"]').click()
    }, 'no-requests')

    // Verify the page rendered correctly
    const text = await browser.elementByCss('#page-e').text()
    expect(text).toBe('Page E')
  })

  it('works with dynamic routes', async () => {
    // Regression test: the build previously failed with
    // "Invariant: missing __PAGE__ segmentPath" when prefetchInlining was
    // combined with dynamic routes.
    const $ = await next.render$('/dynamic/hello')
    expect($('#dynamic-page').text()).toBe('hello')
  })

  it('deduplicates inlined prefetch requests for the same route', async () => {
    // Two links point to the same route (/shared/a/b/c). When the first
    // link is revealed, its prefetch spawns an inlined request. While
    // that request is still pending, revealing the second link should
    // not spawn any additional requests because the segments are already
    // Pending from the first task.
    let page: Playwright.Page

    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        // Reveal the first link, blocking its response so the prefetch
        // stays in-flight.
        await act(async () => {
          await browser
            .elementByCss('input[data-link-accordion="/shared/a/b/c"]')
            .click()
        }, 'block')

        // While the first prefetch is still pending, reveal a second
        // link to the same route. This should not spawn any new
        // requests because the segments are already Pending.
        await act(async () => {
          await browser
            .elementByCss('input[data-link-accordion="duplicate-a"]')
            .click()
        }, 'no-requests')
      },
      {
        includes: 'Page C',
      }
    )

    // Navigate to the route. Because the data was fully prefetched,
    // no additional requests are needed.
    await act(async () => {
      await browser.elementByCss('a[href="/shared/a/b/c"]').click()
    }, 'no-requests')

    const text = await browser.elementByCss('#page-c').text()
    expect(text).toBe('Page C')
  })
})

import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('prefetch inlining', () => {
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
    // all segment data is bundled into a single response, so revealing a
    // link should produce at most 2 prefetch requests per route: one for
    // /_tree and one for the inlined segment data.

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

    // The delta should be at most 2 requests (/_tree + /_inlined).
    // Without inlining, there would be 6+ individual segment requests.
    const delta = rscRequestCount - countBeforeSecondPrefetch
    expect(delta).toBeLessThanOrEqual(2)

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

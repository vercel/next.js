import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry, waitFor } from 'next-test-utils'

describe('segment cache prefetch fallback retry', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev || isNextDeploy) {
    // Prefetching is disabled in dev, and the recovery test relies on
    // observing ISR cache state and background regeneration, which aren't
    // controllable in minimal/deploy mode.
    it('disabled in development / deployment', () => {})
    return
  }

  async function startBrowserWithFakeClock(url: string) {
    let page!: Playwright.Page
    const startDate = Date.now()
    const browser = await next.browser(url, {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
      },
    })
    const act = createRouterAct(page)
    return { browser, page, act }
  }

  it('does not retry a prefetch that received a concrete (non-fallback) response', async () => {
    const { browser, page, act } = await startBrowserWithFakeClock('/')

    // The static route is prerendered at build time (generateStaticParams
    // enumerates `1`), so the prefetch receives a concrete response that is
    // not marked as a fallback.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/static-posts/1"]')
        .click()
    })

    // No retry should fire for a concrete response, even after advancing well
    // past the retry interval.
    await act(async () => {
      await page.clock.fastForward(5000)
    }, 'no-requests')
  })

  it('does not retry a fallback shell for a route that can never be upgraded', async () => {
    const { browser, page, act } = await startBrowserWithFakeClock('/')

    // This route has no generateStaticParams, so its fallback shell can never
    // be upgraded to a concrete version. The prefetch still serves the shell,
    // but it must NOT be flagged as a fallback — so the client never retries.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/no-static-params/1"]')
        .click()
    })

    // Because the shell wasn't flagged as an upgradeable fallback, no retry
    // fires even after advancing past the retry interval.
    await act(async () => {
      await page.clock.fastForward(5000)
    }, 'no-requests')
  })

  it('picks up the upgraded version on retry once the server regenerates the ISR entry', async () => {
    const { browser, page, act } = await startBrowserWithFakeClock('/')

    // 1. Prefetch the un-enumerated param. The route has generateStaticParams
    //    (for a different value), so this param is upgradeable: the server
    //    serves a fallback shell, flagged so the client knows to retry.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/posts/recovery"]')
        .click()
    })

    // 2. The client clock is frozen, so no retry has fired yet. Drive the
    //    server to upgrade the ISR entry from a fallback shell to the concrete
    //    version, and wait until it's observable. There is an inherent race
    //    here — the background regeneration is asynchronous — so we poll until
    //    it completes before letting the client continue.
    //
    //    A normal navigation request triggers the background regeneration. We
    //    observe completion via the *static prefetch* response (RSC +
    //    Next-Router-Prefetch), which is served from the cached prerender
    //    rather than re-rendered per request: the concrete param content is
    //    absent from the fallback shell and only appears once the entry has
    //    been upgraded. (A normal navigation always streams the concrete
    //    content dynamically, so it can't be used to observe the upgrade.)
    await retry(async () => {
      // Trigger (and, until it completes, re-trigger) background regeneration.
      await next.fetch('/posts/recovery')

      const res = await next.fetch('/posts/recovery', {
        headers: {
          RSC: '1',
          'Next-Router-Prefetch': '1',
          'Next-Router-Segment-Prefetch': '/_full',
        },
      })
      const body = await res.text()
      expect(body).toContain('Post body for recovery')
    })

    // 3. Now let the client retry fire. It re-fetches the segment and receives
    //    the upgraded (concrete) version.
    await act(
      async () => {
        await page.clock.fastForward(2000)
      },
      { includes: 'Post body for recovery' }
    )
  })

  it('retries a static fallback prefetch a bounded number of times, then stops', async () => {
    const { browser, page } = await startBrowserWithFakeClock('/')

    // Pin the server so it can never upgrade this route's ISR fallback to a
    // concrete version — the client keeps receiving the fallback shell on every
    // retry. (Uses its own un-enumerated param so it doesn't share an ISR entry
    // with the recovery test above.)
    const getRequestCount = await simulateNeverUpgradingIsrEntries(
      page,
      '/posts/retry-limit'
    )

    await browser
      .elementByCss('input[data-link-accordion="/posts/retry-limit"]')
      .click()

    // Advance the clock far past any number of retry intervals. The retry loop
    // is bounded, so even though we pump the clock much more than it could ever
    // need, only a handful of requests are ever issued.
    for (let i = 0; i < 20; i++) {
      await page.clock.fastForward(1000)
      // Let any in-flight retry settle and re-arm its next timer before the
      // next advance.
      await waitFor(100)
    }

    // The initial prefetch plus a small, fixed number of retries — never a
    // runaway loop.
    expect(getRequestCount()).toBeLessThan(5)
  })
})

/**
 * Intercepts the per-segment prefetch requests for `pathname` and, after the
 * first response for a given segment, replays that same response for every
 * later request to it — without contacting the server again.
 *
 * This simulates a deployment whose server never upgrades its ISR fallback
 * entries to concrete versions: the client keeps receiving the fallback shell
 * no matter how many times it retries. (Normally an upgradeable route
 * regenerates in the background, so a retry would eventually pick up the
 * concrete version — which is exactly what we want to prevent when testing the
 * retry *limit*.)
 *
 * Returns a getter for the number of intercepted segment-bundle requests.
 */
async function simulateNeverUpgradingIsrEntries(
  page: Playwright.Page,
  pathname: string
): Promise<() => number> {
  const cachedResponses = new Map<
    string,
    { body: Buffer; headers: Record<string, string>; status: number }
  >()
  let requestCount = 0
  await page.route('**/*', async (route) => {
    const request = route.request()
    const headers = request.headers()
    const segmentKey = headers['next-router-segment-prefetch']
    const isSegmentBundlePrefetch =
      headers['next-router-prefetch'] !== undefined &&
      segmentKey !== undefined &&
      // The route-tree request (`/_tree`) is not a segment bundle.
      segmentKey !== '/_tree' &&
      new URL(request.url()).pathname === pathname
    if (!isSegmentBundlePrefetch) {
      route.continue()
      return
    }

    requestCount++
    let cached = cachedResponses.get(segmentKey)
    if (cached === undefined) {
      // First request for this segment: capture the real (fallback) response.
      // Mirrors router-act's internal fetch pattern.
      const original = await page.request.fetch(request, { maxRedirects: 0 })
      const responseHeaders = original.headers()
      // Buffered replay doesn't stream; drop the chunked-encoding header to
      // avoid net::ERR_INCOMPLETE_CHUNKED_ENCODING (see router-act).
      delete responseHeaders['transfer-encoding']
      cached = {
        body: await original.body(),
        headers: responseHeaders,
        status: original.status(),
      }
      cachedResponses.set(segmentKey, cached)
    }
    await route.fulfill(cached)
  })
  return () => requestCount
}

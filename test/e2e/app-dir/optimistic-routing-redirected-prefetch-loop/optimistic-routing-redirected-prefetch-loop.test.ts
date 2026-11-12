import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type { Page, Request, Route } from 'playwright'

// Regression test for https://github.com/vercel/next.js/issues/100431
//
// On Vercel, the segment prefetch of a page that calls `redirect()` can be
// answered by the CDN with an HTTP 307 instead of a 200 that carries the
// redirect inside the RSC payload (which is what `next start` returns). With
// optimistic routing enabled, the client then re-prefetches the same link
// forever (~1,000 requests per second), until the tab is closed.
//
// `next start` doesn't produce the 307, so the test emulates the CDN by
// answering segment prefetches for the redirected paths with a 307.
describe('optimistic-routing-redirected-prefetch-loop', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Known Routes prediction is only used in production builds.
    test('skipped in dev mode', () => {})
    return
  }

  const REDIRECTS: Record<string, string> = {
    '/old/a': '/docs/one',
    '/old/b': '/docs/two',
  }

  // Without the bug, each path sees only a handful of RSC requests. With the
  // bug, the redirected link exceeds this within milliseconds.
  const MAX_RSC_REQUESTS_PER_PATH = 10

  // How long to watch the idle page for a prefetch loop after the initial
  // prefetches have completed.
  const IDLE_WINDOW_MS = 3000

  it('does not prefetch a link forever when its segment prefetch is answered with a 307', async () => {
    const rscRequestCounts = new Map<string, number>()

    const browser = await next.browser('/', {
      async beforePageLoad(page: Page) {
        await page.route('**/*', async (route: Route) => {
          const request = route.request()
          const target = REDIRECTS[new URL(request.url()).pathname]
          if (
            target !== undefined &&
            request.headers()['next-router-segment-prefetch'] !== undefined
          ) {
            await route.fulfill({ status: 307, headers: { location: target } })
            return
          }
          await route.fallback()
        })

        page.on('request', (request: Request) => {
          if (request.headers().rsc === undefined) {
            return
          }
          const pathname = new URL(request.url()).pathname
          rscRequestCounts.set(
            pathname,
            (rscRequestCounts.get(pathname) ?? 0) + 1
          )
        })
      },
    })

    // Wait until every link has been prefetched at least once.
    await retry(async () => {
      for (const pathname of [
        '/docs/one',
        '/docs/two',
        '/docs/three',
        '/old/a',
        '/old/b',
      ]) {
        expect(rscRequestCounts.get(pathname) ?? 0).toBeGreaterThan(0)
      }
    })

    // Leave the page idle. A loop shows up as an unbounded number of requests
    // for the redirected link and its target, so a fixed window is needed to
    // assert that the request count stays bounded.
    await waitFor(IDLE_WINDOW_MS)

    const excessive = Object.fromEntries(
      [...rscRequestCounts].filter(
        ([, count]) => count > MAX_RSC_REQUESTS_PER_PATH
      )
    )
    expect(excessive).toEqual({})

    // Navigating via the redirected link still lands on its target.
    await browser.elementByCss('a[href="/old/b"]').click()
    await retry(async () => {
      expect(await browser.elementById('heading').text()).toBe('/docs/two')
    })
  })
})

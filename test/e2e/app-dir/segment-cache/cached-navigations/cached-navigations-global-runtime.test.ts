import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// The `global-runtime` fixture sets `experimental.cachedNavigations:
// 'allow-runtime'`, which makes every route runtime-cache its navigations
// regardless of whether a segment opted in via `prefetch = 'allow-runtime'`.
describe('cached navigations - global allow-runtime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'global-runtime'),
  })

  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('runtime-caches a route that has no per-segment prefetch config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // First navigation to /runtime-prefetchable — a route that reads request
    // data (searchParams, cookies, headers) but does NOT export
    // `prefetch = 'allow-runtime'`. The link uses prefetch={false}, so this is
    // a plain navigation with no prefetch.
    await act(
      async () => {
        await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
      },
      { includes: 'Dynamic content' }
    )

    // Everything is visible after the full dynamic response.
    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )
    expect(
      await browser.elementById('search-params-boundary').text()
    ).toContain('Search params:')
    expect(await browser.elementById('cookies-boundary').text()).toContain(
      'Cookie:'
    )
    expect(await browser.elementById('headers-boundary').text()).toContain(
      'Header:'
    )
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Second navigation — under the global flag, the request-derived content
    // (searchParams, cookies, headers) was runtime-cached from the first
    // navigation's embedded runtime prefetch stream and shows instantly, even
    // with the dynamic request blocked. Without the global flag this route
    // would only get static caching, since it never opts in via
    // `prefetch = 'allow-runtime'`. Only the truly dynamic connection() content
    // needs a server request.
    await act(async () => {
      await act(
        async () => {
          await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      // Static cached content is visible.
      expect(await browser.elementById('cached-content').text()).toContain(
        'Cached content'
      )

      // Request-derived content is runtime-cached from the first navigation,
      // despite no per-segment opt-in.
      expect(
        await browser.elementById('search-params-boundary').text()
      ).toContain('Search params:')
      expect(await browser.elementById('cookies-boundary').text()).toContain(
        'Cookie:'
      )
      expect(await browser.elementById('headers-boundary').text()).toContain(
        'Header:'
      )

      // Only connection() shows a Suspense fallback — it's truly dynamic.
      expect(await browser.elementById('connection-boundary').text()).toBe(
        'Loading connection...'
      )
    })

    // After unblocking, the dynamic content resolves too.
    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })
})

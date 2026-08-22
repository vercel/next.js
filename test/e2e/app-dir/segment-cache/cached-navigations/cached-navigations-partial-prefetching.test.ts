import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// The `partial-prefetching` fixture enables Partial Prefetching globally via
// the next-config `partialPrefetching: true`, which opts routes without an
// explicit segment override into runtime Cached Navigations.
describe('cached navigations - global partialPrefetching', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'partial-prefetching'),
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
    // data but does NOT export any `prefetch` config. The link uses
    // prefetch={false}, so this is a plain navigation with no prefetch.
    await act(
      async () => {
        await browser.elementByCss('a[href="/runtime-prefetchable"]').click()
      },
      { includes: 'Dynamic content' }
    )

    expect(await browser.elementById('cached-content').text()).toContain(
      'Cached content'
    )

    // Navigate back to home
    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    // Second navigation — under the global `partialPrefetching` config, the
    // request-derived content (searchParams, cookies, headers) was
    // runtime-cached from the first navigation and shows instantly, even with
    // the dynamic request blocked. Only the truly dynamic connection() content
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
      expect(await browser.elementById('navigation-boundary').text()).toContain(
        'Navigation content'
      )
      expect(await browser.elementById('prefetch-boundary').text()).toContain(
        'Prefetch content'
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

  it('does not embed a runtime prefetch in HTML for a force-disabled route', async () => {
    const html = await next.render('/runtime-prefetch-disabled')

    // One copy renders as HTML and one hydrates it. A third copy would be the
    // embedded runtime prefetch used to seed the client cache.
    expect((html.match(/Cached content/g) ?? []).length).toBe(2)
  })

  it('does not runtime-cache a force-disabled route after a dynamic navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
      },
    })
    const act = createRouterAct(page)

    // A plain navigation renders the route, but should not seed the runtime
    // segment cache because the destination explicitly opts out.
    await act(
      async () => {
        await browser
          .elementByCss('a[href="/runtime-prefetch-disabled"]')
          .click()
      },
      { includes: 'Dynamic content' }
    )

    await browser.back()
    expect(await browser.elementByCss('h1').text()).toBe('Home')

    await act(async () => {
      await act(
        async () => {
          await browser
            .elementByCss('a[href="/runtime-prefetch-disabled"]')
            .click()
        },
        {
          includes: 'Dynamic content',
          block: true,
        }
      )

      const mainText = await (await browser.elementByCss('main')).innerText()
      expect(mainText).not.toContain('Search params:')
      expect(mainText).not.toContain('Cookie:')
      expect(mainText).not.toContain('Header:')
    })

    expect(await browser.elementById('connection-boundary').text()).toContain(
      'Dynamic content'
    )
  })
})

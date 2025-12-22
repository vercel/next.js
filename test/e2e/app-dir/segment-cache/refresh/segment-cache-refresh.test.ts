import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache (refresh)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  it('router.refresh() refreshes both cached and dynamic data', async () => {
    // Load the main Dashboard page. This will render the nav bar into the
    // @navbar slot.
    let page: Playwright.Page
    const browser = await next.browser('/dashboard', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Navigate to the Analytics page. The analytics page does not match the
    // @navbar slot, so the client reuses the one that was rendered by the
    // previous page.
    await act(async () => {
      const toggleAnalyticsLink = await browser.elementByCss(
        'input[data-link-accordion="/dashboard/analytics"]'
      )
      await toggleAnalyticsLink.click()
      const link = await browser.elementByCss('a[href="/dashboard/analytics"]')
      await link.click()
    })

    // Reveal the link to the docs page to prefetch it.
    await act(
      async () => {
        const toggleDocsLink = await browser.elementByCss(
          'input[data-link-accordion="/docs"]'
        )
        await toggleDocsLink.click()
      },
      {
        includes: 'Static docs page',
      }
    )

    // Click the client refresh button and confirm the navigation bar is
    // re-rendered, even though it's not part of the Analytics page.
    await act(async () => {
      const refreshButton = await browser.elementById('client-refresh-button')
      await refreshButton.click()
    }, [
      {
        includes: 'Navbar dynamic render counter',
      },
      {
        // router.refresh() also purges Cache Components from the client cache,
        // so we must re-prefetch the docs page
        includes: 'Static docs page',
      },
    ])

    const navbarDynamicRenderCounter = await browser.elementById(
      'navbar-dynamic-render-counter'
    )
    // If this is still 0, then the nav bar was not successfully refreshed
    expect(await navbarDynamicRenderCounter.textContent()).toBe('1')
  })

  it('Server Action refresh() refreshes dynamic data only, not cached', async () => {
    // Load the main Dashboard page. This will render the nav bar into the
    // @navbar slot.
    let page: Playwright.Page
    const browser = await next.browser('/dashboard', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Navigate to the Analytics page. The analytics page does not match the
    // @navbar slot, so the client reuses the one that was rendered by the
    // previous page.
    await act(async () => {
      const toggleAnalyticsLink = await browser.elementByCss(
        'input[data-link-accordion="/dashboard/analytics"]'
      )
      await toggleAnalyticsLink.click()
      const link = await browser.elementByCss('a[href="/dashboard/analytics"]')
      await link.click()
    })

    // Reveal the link to the docs page to prefetch it.
    await act(
      async () => {
        const toggleDocsLink = await browser.elementByCss(
          'input[data-link-accordion="/docs"]'
        )
        await toggleDocsLink.click()
      },
      {
        includes: 'Static docs page',
      }
    )

    // Click the server refresh button and confirm the navigation bar is
    // re-rendered, even though it's not part of the Analytics page.
    await act(async () => {
      const refreshButton = await browser.elementById('server-refresh-button')
      await refreshButton.click()
    }, [
      {
        includes: 'Navbar dynamic render counter',
      },
      {
        // The server form of refresh() does _not_ purge Cache Components from
        // the client cache, so we shouldn't need to re-prefetch the docs page.
        includes: 'Static docs page',
        block: 'reject',
      },
    ])

    const navbarDynamicRenderCounter = await browser.elementById(
      'navbar-dynamic-render-counter'
    )
    // If this is still 0, then the nav bar was not successfully refreshed
    expect(await navbarDynamicRenderCounter.textContent()).toBe('1')

    // Confirm that navigating the the docs page does not require any
    // additional requests.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/docs"]')
      await link.click()
      const docsPage = await browser.elementById('docs-page')
      expect(await docsPage.textContent()).toBe('Static docs page')
    }, 'no-requests')
  })
})

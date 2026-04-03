import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// Disabled because too flaky
describe.skip('segment cache (refresh)', () => {
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

  it('re-navigation to a fully static page does not overwrite dynamic slots with default content', async () => {
    // Load the main Dashboard page. The @navbar slot renders dynamic content
    // (connection() + randomUUID()), but the @main slot is static.
    let page: Playwright.Page
    const browser = await next.browser('/dashboard', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Navigate to the Analytics page. This is a fully static page (both the
    // @main/analytics slot and the @navbar/default slot are static), so the
    // server responds with a Static completeness marker. The client writes
    // all segments into the segment cache.
    await act(async () => {
      const toggleAnalyticsLink = await browser.elementByCss(
        'input[data-link-accordion="/dashboard/analytics"]'
      )
      await toggleAnalyticsLink.click()
      const link = await browser.elementByCss('a[href="/dashboard/analytics"]')
      await link.click()
    })

    // Navigate back to the Dashboard page.
    await act(async () => {
      const toggleDashboardLink = await browser.elementByCss(
        'input[data-link-accordion="/dashboard"]'
      )
      await toggleDashboardLink.click()
      const link = await browser.elementByCss('a[href="/dashboard"]')
      await link.click()
    })

    // Navigate to the Analytics page again. Since it's fully static and was
    // already visited, this should be served entirely from the segment cache
    // without any server requests.
    await act(async () => {
      const link = await browser.elementByCss('a[href="/dashboard/analytics"]')
      await link.click()
    }, 'no-requests')

    // Verify the navbar still shows the dynamic content from the original
    // /dashboard render, not the static @navbar/default.tsx content.
    const navbarDynamicRenderCounter = await browser.elementById(
      'navbar-dynamic-render-counter'
    )
    expect(await navbarDynamicRenderCounter.textContent()).toBe('0')
  })
})

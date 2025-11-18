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

  it('refreshes data inside reused default parallel route slots', async () => {
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

    // Click the refresh button and confirm the navigation bar is re-rendered,
    // even though it's not part of the Analytics page.
    await act(
      async () => {
        const refreshButton = await browser.elementById('client-refresh-button')
        await refreshButton.click()
      },
      {
        includes: 'Navbar dynamic render counter',
      }
    )

    const navbarDynamicRenderCounter = await browser.elementById(
      'navbar-dynamic-render-counter'
    )
    // If this is still 0, then the nav bar was not successfully refreshed
    expect(await navbarDynamicRenderCounter.textContent()).toBe('1')
  })
})

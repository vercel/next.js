import { nextTestSetup } from 'e2e-utils'
import { retry, toggleDevToolsIndicatorPopover } from 'next-test-utils'
import { Playwright } from 'next-webdriver'

describe('instant-nav-panel', () => {
  const { isNextDev, isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  async function waitForPanelRouterTransition() {
    // Run all the necessary CSS transitions
    // and click-outside event handler adjustment due to cascading update.
    // TODO: Consider disabling transitions entirely in Next.js tests.
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        // MENU_DURATION_MS + some flakiness buffer
        200 + 50
      )
    )
  }

  async function waitForInstantModeCookie(browser: Playwright): Promise<void> {
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).toMatch(/next-instant-navigation-testing=[^;]+/)
    })
  }

  async function clearInstantModeCookie(browser: Playwright) {
    await browser.eval(() => {
      document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'
    })
  }

  async function clickInstantNavMenuItem(browser: Playwright) {
    await browser.elementByCss('[data-instant-nav]').click()
  }

  async function clickStartClientNav(browser: Playwright) {
    await browser
      // TODO: Monitor if we need to increase timeouts for all *instant calls
      .elementByCss('[data-instant-nav-client]', { timeout: 50 })
      .click()
    await waitForInstantModeCookie(browser)
  }

  async function getInstantNavPanelText(browser: Playwright): Promise<string> {
    return browser.elementByCssInstant('.instant-nav-panel').text()
  }

  async function closePanelViaHeader(browser: Playwright) {
    return browser.elementByCss('#_next-devtools-panel-close').click()
  }

  async function hasInstantNavPanelOpen(browser: Playwright): Promise<void> {
    await browser.elementByCssInstant('.instant-nav-panel')
  }

  async function openInstantNavPanel(browser: Playwright) {
    await toggleDevToolsIndicatorPopover(browser)
    await waitForPanelRouterTransition()
    await clickInstantNavMenuItem(browser)

    await retry(
      async () => {
        await hasInstantNavPanelOpen(browser)
      },
      5_000,
      500
    )
    await waitForPanelRouterTransition()
  }

  it('should open panel in waiting state without setting cookie', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Panel should show waiting state with Page load and Client navigation sections
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Page load')
      expect(text).toContain('Client navigation')
    })

    // Cookie should NOT be set yet (only set when user clicks Reload or Start)
    const cookie = await browser.eval(() => document.cookie)
    expect(cookie).not.toContain('next-instant-navigation-testing=')

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show client nav state after clicking Start and navigating', async () => {
    const targetPage = '/target-page/my-post?search=foo'
    if (isNextDev && !isTurbopack) {
      // warmup target page compilation before clicking Start, to avoid extra flakiness.
      void next.render(targetPage).catch(() => {})
    }
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Click Start to enter client-nav-waiting state
    await clickStartClientNav(browser)

    // Cookie should now be set
    await waitForInstantModeCookie(browser)

    // Panel should show client-nav-waiting state
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Client navigation')
      expect(text).toContain('Click any link')
    })

    // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
    await browser.eval((page) => {
      document.querySelector<HTMLAnchorElement>(`[href="${page}"]`)!.click()
    }, targetPage)

    // Panel should transition to client-nav state
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Client navigation')
      expect(text).toContain('prefetched UI')
      expect(text).toContain('Continue rendering')
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show loading skeleton during SPA navigation after clicking Start', async () => {
    const targetPage = '/target-page/my-post?search=foo'
    if (isNextDev && !isTurbopack) {
      // warmup target page compilation before clicking Start, to avoid extra flakiness.
      void next.render(targetPage).catch(() => {})
    }
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Click Start to activate the navigation lock
    await clickStartClientNav(browser)

    // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
    await browser.eval((page) => {
      document.querySelector<HTMLAnchorElement>(`[href="${page}"]`)!.click()
    }, targetPage)

    // The data fetching skeleton should be visible (dynamic content is locked).
    // Use a longer timeout because dev mode needs to compile the target page.
    await retry(
      async () => {
        const skeleton = await browser.hasElementByCss(
          '[data-testid="dynamic-skeleton"]'
        )
        expect(skeleton).toBe(true)
      },
      30000,
      500
    )

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should auto-open panel on page load when cookie is already set', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Open the panel and click Start to set the cookie
    await openInstantNavPanel(browser)
    await clickStartClientNav(browser)

    // Reload — the cookie persists, so the panel should auto-open
    await browser.refresh()
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await retry(async () => {
      await hasInstantNavPanelOpen(browser)
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should not set cookie when closing panel from waiting state', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Verify cookie is NOT set (panel opened without activating lock)
    const cookie = await browser.eval(() => document.cookie)
    expect(cookie).not.toContain('next-instant-navigation-testing=')

    // Close panel via X button
    await closePanelViaHeader(browser)

    // Cookie should still not be set, and no reload should happen
    await retry(async () => {
      const cookieAfter = await browser.eval(() => document.cookie)
      expect(cookieAfter).not.toContain('next-instant-navigation-testing=')
    })
  })
})

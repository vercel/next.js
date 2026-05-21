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

  async function clickStartCapturing(browser: Playwright) {
    await browser
      .locator('.instant-nav-capture-button', { hasText: 'Start Capturing' })
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

  it('should open panel in the idle state', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Panel should show the idle helper copy and capture controls.
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Inspect the UI')
      expect(text).toContain('Start Capturing')
      expect(text).toContain('Continue Rendering')
    })

    // Cookie should NOT be set yet (only set when user starts capturing)
    const cookie = await browser.eval(() => document.cookie)
    expect(cookie).not.toContain('next-instant-navigation-testing=')

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show page load state after clicking Start and refreshing', async () => {
    const browser = await next.browser('/target-page/my-post?search=foo')
    await clearInstantModeCookie(browser)

    await openInstantNavPanel(browser)

    await clickStartCapturing(browser)
    await browser.refresh()
    await hasInstantNavPanelOpen(browser)

    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Page load')
      expect(text).toContain('prerendered UI')
      expect(text).toContain('Stop Capturing')
      expect(text).toContain('Continue Rendering')
    })
  })

  it('should show client nav state after clicking Start and navigating', async () => {
    const targetPage = '/target-page/my-post?search=foo'
    const [browser] = await Promise.all([
      next.browser('/'),
      isNextDev && !isTurbopack
        ? // warmup target page compilation before clicking Start, to avoid extra flakiness.
          next.render(targetPage).catch(() => {})
        : null,
    ])
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Click Start to enter the awaiting navigation state
    await clickStartCapturing(browser)

    // Cookie should now be set
    await waitForInstantModeCookie(browser)

    // Panel should show the awaiting navigation state
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Awaiting navigation')
      expect(text).toContain('Stop Capturing')
      expect(text).toContain('Continue Rendering')
    })

    // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
    await browser.eval((page) => {
      document.querySelector<HTMLAnchorElement>(`[href="${page}"]`)!.click()
    }, targetPage)

    // Panel should transition to client navigation capture state
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Navigation')
      expect(text).toContain('prefetched UI')
      expect(text).toContain('Stop Capturing')
      expect(text).toContain('Continue Rendering')
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show loading skeleton during SPA navigation after clicking Start', async () => {
    const targetPage = '/target-page/my-post?search=foo'
    const [browser] = await Promise.all([
      next.browser('/'),
      isNextDev && !isTurbopack
        ? // warmup target page compilation before clicking Start, to avoid extra flakiness.
          next.render(targetPage).catch(() => {})
        : null,
    ])
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Click Start to activate the navigation lock
    await clickStartCapturing(browser)

    // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
    await browser.eval((page) => {
      document.querySelector<HTMLAnchorElement>(`[href="${page}"]`)!.click()
    }, targetPage)

    // Dynamic data should be suspended under the lock.
    // Use a longer timeout because dev mode needs to compile the target page.
    await browser
      .locator('[data-testid="dynamic-skeleton"]')
      .waitFor({ state: 'visible', timeout: 30000 })
    expect(
      await browser.locator('[data-testid="dynamic-content"]').count()
    ).toBe(0)

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should auto-open panel on page load when cookie is already set', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Open the panel and click Start to set the cookie
    await openInstantNavPanel(browser)
    await clickStartCapturing(browser)

    // Reload — the cookie persists, so the panel should auto-open
    await browser.refresh()
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await retry(async () => {
      await hasInstantNavPanelOpen(browser)
      const text = await getInstantNavPanelText(browser)
      expect(text).toContain('Page load')
      expect(text).toContain('prerendered UI')
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

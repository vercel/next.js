import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry, toggleDevToolsIndicatorPopover } from 'next-test-utils'

describe('instant-nav-panel', () => {
  const { isNextDev, isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  const targetPage = '/target-page/my-post?search=foo'

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

  async function waitForInstantModeCookieAbsent(
    browser: Playwright
  ): Promise<void> {
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).not.toContain('next-instant-navigation-testing=')
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

  async function clickContinueRendering(browser: Playwright) {
    await browser
      .locator('.instant-nav-capture-button', {
        hasText: 'Continue Rendering',
      })
      .click()
  }

  async function clickLink(browser: Playwright, href: string) {
    await browser.eval((page) => {
      document.querySelector<HTMLAnchorElement>(`[href="${page}"]`)!.click()
    }, href)
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

  async function waitForInstantNavPanelOpen(browser: Playwright) {
    await retry(
      async () => {
        await hasInstantNavPanelOpen(browser)
      },
      5_000,
      500
    )
  }

  async function waitForAppHydration(browser: Playwright) {
    await browser.waitForElementByCss(
      '[data-testid="app-hydration-marker"][data-hydrated="true"]'
    )
  }

  async function openInstantNavPanel(browser: Playwright) {
    await toggleDevToolsIndicatorPopover(browser)
    await waitForPanelRouterTransition()
    await clickInstantNavMenuItem(browser)

    await waitForInstantNavPanelOpen(browser)
    await waitForPanelRouterTransition()
  }

  async function isInstantNavPanelMounted(browser: Playwright) {
    return browser.eval(() => {
      const portal = document.querySelector('nextjs-portal')
      const root = portal?.shadowRoot ?? document
      return Boolean(root.querySelector('.instant-nav-panel'))
    })
  }

  async function clickInstantNavMenuItemIfMounted(browser: Playwright) {
    return browser.eval(() => {
      const portal = document.querySelector('nextjs-portal')
      const root = portal?.shadowRoot ?? document
      const element = root.querySelector<HTMLElement>('[data-instant-nav]')
      if (!element) {
        return false
      }
      element.click()
      return true
    })
  }

  async function reopenInstantNavPanelFromMenu(browser: Playwright) {
    await retry(
      async () => {
        if (await isInstantNavPanelMounted(browser)) {
          return
        }
        if (await clickInstantNavMenuItemIfMounted(browser)) {
          return
        }
        await toggleDevToolsIndicatorPopover(browser)
        await waitForPanelRouterTransition()
        if (await isInstantNavPanelMounted(browser)) {
          return
        }
        if (await clickInstantNavMenuItemIfMounted(browser)) {
          return
        }
        throw new Error('Instant nav menu item was not available')
      },
      5_000,
      250
    )
    await waitForInstantNavPanelOpen(browser)
    await waitForPanelRouterTransition()
  }

  async function expectInstantNavPanelText(
    browser: Playwright,
    ...expectedText: string[]
  ) {
    await retry(async () => {
      const text = await getInstantNavPanelText(browser)
      for (const expected of expectedText) {
        expect(text).toContain(expected)
      }
    })
  }

  async function expectIdlePanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Inspect the UI',
      'Start Capturing',
      'Continue Rendering'
    )
  }

  async function expectPendingPanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Awaiting navigation',
      'Stop Capturing',
      'Continue Rendering'
    )
  }

  async function expectMpaPanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Page load',
      'prerendered UI',
      'Stop Capturing',
      'Continue Rendering'
    )
  }

  async function expectSpaPanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Navigation',
      'prefetched UI',
      'Stop Capturing',
      'Continue Rendering'
    )
  }

  async function expectTargetPageMpaShell(browser: Playwright) {
    await browser
      .locator('[data-testid="dynamic-skeleton"]')
      .waitFor({ state: 'visible', timeout: 30000 })
    await browser
      .locator('[data-testid="param-skeleton"]')
      .waitFor({ state: 'visible' })
    await browser
      .locator('[data-testid="search-param-skeleton"]')
      .waitFor({ state: 'visible' })
    expect(
      await browser.locator('[data-testid="dynamic-content"]').count()
    ).toBe(0)
    expect(await browser.locator('[data-testid="param-value"]').count()).toBe(0)
    expect(
      await browser.locator('[data-testid="search-param-value"]').count()
    ).toBe(0)
  }

  async function expectTargetPageSpaShell(browser: Playwright) {
    await browser
      .locator('[data-testid="dynamic-skeleton"]')
      .waitFor({ state: 'visible', timeout: 30000 })
    await browser
      .locator('[data-testid="param-value"]')
      .waitFor({ state: 'visible' })
    await browser
      .locator('[data-testid="search-param-value"]')
      .waitFor({ state: 'visible' })
    expect(
      await browser.elementByCss('[data-testid="param-value"]').text()
    ).toBe('slug=my-post')
    expect(
      await browser.elementByCss('[data-testid="search-param-value"]').text()
    ).toBe('?search=foo')
    expect(
      await browser.locator('[data-testid="dynamic-content"]').count()
    ).toBe(0)
  }

  async function expectTargetPageRendered(browser: Playwright) {
    await browser
      .locator('[data-testid="dynamic-content"]')
      .waitFor({ state: 'visible', timeout: 30000 })
  }

  async function openHomeWithTargetPageWarmup() {
    const [browser] = await Promise.all([
      next.browser('/'),
      isNextDev && !isTurbopack
        ? // warmup target page compilation before clicking Start, to avoid extra flakiness.
          next.render(targetPage).catch(() => {})
        : null,
    ])
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await waitForAppHydration(browser)
    return browser
  }

  describe('idle state', () => {
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

    it('should not set cookie when closing panel from idle state', async () => {
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

  describe('awaiting navigation state', () => {
    it('should reset the panel and app when pressing the close button from awaiting navigation', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await closePanelViaHeader(browser)
      await waitForPanelRouterTransition()
      await waitForInstantModeCookieAbsent(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await reopenInstantNavPanelFromMenu(browser)
      await expectIdlePanel(browser)
    })
  })

  describe('MPA captures', () => {
    it('should show page load state after clicking Start and refreshing', async () => {
      const browser = await next.browser(targetPage)
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)

      await clickStartCapturing(browser)
      await browser.refresh()
      await waitForInstantNavPanelOpen(browser)

      await expectMpaPanel(browser)
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

    it('should reset the panel and app when pressing the close button from captured MPA state', async () => {
      const browser = await next.browser(targetPage)
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await waitForInstantNavPanelOpen(browser)
      await expectMpaPanel(browser)
      await expectTargetPageMpaShell(browser)

      await closePanelViaHeader(browser)
      await waitForPanelRouterTransition()
      await waitForInstantModeCookieAbsent(browser)
      await expectTargetPageRendered(browser)

      await reopenInstantNavPanelFromMenu(browser)
      await expectIdlePanel(browser)
    })

    it('should keep params and searchParams RSC content suspended for a captured MPA page load', async () => {
      const browser = await next.browser(targetPage)
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await waitForInstantNavPanelOpen(browser)
      await expectMpaPanel(browser)

      await expectTargetPageMpaShell(browser)
    })

    it('should show MPA state after clicking a link that crosses root layouts', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)
      await browser.eval(() => {
        document
          .querySelector<HTMLAnchorElement>('#link-to-mpa-target')!
          .click()
      })
      await browser.waitForElementByCss('[data-testid="mpa-target-title"]')
      await waitForInstantNavPanelOpen(browser)

      await expectMpaPanel(browser)
      await browser
        .locator('[data-testid="mpa-dynamic-skeleton"]')
        .waitFor({ state: 'visible', timeout: 30000 })
      expect(
        await browser.locator('[data-testid="mpa-dynamic-content"]').count()
      ).toBe(0)
    })

    it('should re-arm capture and return to awaiting navigation after Continue Rendering from MPA state', async () => {
      const browser = await next.browser(targetPage)
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await waitForInstantNavPanelOpen(browser)
      await expectMpaPanel(browser)
      await expectTargetPageMpaShell(browser)
      await waitForAppHydration(browser)

      await clickContinueRendering(browser)
      await expectPendingPanel(browser)
      await expectTargetPageRendered(browser)
      await waitForInstantModeCookie(browser)
    })
  })

  describe('SPA captures', () => {
    it('should show client nav state after clicking Start and navigating', async () => {
      const browser = await openHomeWithTargetPageWarmup()

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
      await clickLink(browser, targetPage)

      // Panel should transition to client navigation capture state
      await expectSpaPanel(browser)

      // Clean up
      await clearInstantModeCookie(browser)
    })

    it('should show loading skeleton during SPA navigation after clicking Start', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)

      // Click Start to activate the navigation lock
      await clickStartCapturing(browser)

      // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
      await clickLink(browser, targetPage)

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

    it('should reset the panel and app when pressing the close button from captured SPA state', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, targetPage)
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)

      await closePanelViaHeader(browser)
      await waitForPanelRouterTransition()
      await waitForInstantModeCookieAbsent(browser)
      await expectTargetPageRendered(browser)

      await reopenInstantNavPanelFromMenu(browser)
      await expectIdlePanel(browser)
    })

    it('should show params and searchParams RSC content for a captured SPA navigation', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, targetPage)
      await expectSpaPanel(browser)

      await expectTargetPageSpaShell(browser)
    })

    it('should re-arm capture and return to awaiting navigation after Continue Rendering from SPA state', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, targetPage)
      await expectSpaPanel(browser)

      await clickContinueRendering(browser)
      await expectPendingPanel(browser)
      await expectTargetPageRendered(browser)
      await waitForInstantModeCookie(browser)
    })
  })

  describe('transitions between capture types', () => {
    it('should keep the panel in MPA state after capture -> reload and then update to SPA state after client navigation', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)
      await waitForInstantNavPanelOpen(browser)
      await expectMpaPanel(browser)

      await clickLink(browser, targetPage)
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)
    })

    it('should avoid showing stale SPA state when reloading from a captured SPA state into captured MPA state', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, targetPage)
      await expectSpaPanel(browser)

      await browser.refresh()
      await waitForInstantNavPanelOpen(browser)

      const initialPanelText = await getInstantNavPanelText(browser)
      expect(initialPanelText).toContain('Page load')
      expect(initialPanelText).not.toContain('Navigation')

      await expectMpaPanel(browser)
      await expectTargetPageMpaShell(browser)
    })
  })
})

import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry, toggleDevToolsIndicatorPopover } from 'next-test-utils'

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
    await browser.locator('#instant-nav-pause-toggle').click()
    await waitForInstantModeCookie(browser)
  }

  async function clickResume(browser: Playwright) {
    await browser
      .locator('.instant-nav-debugger-paused-button', {
        hasText: 'Resume',
      })
      .click()
  }

  async function disableCookieStoreSet(browser: Playwright) {
    await browser.eval(() => {
      if (typeof cookieStore !== 'undefined') {
        const prototype = Object.getPrototypeOf(cookieStore) as {
          set: typeof cookieStore.set
        }
        prototype.set = async () => undefined
      }
    })
  }

  async function clickLink(browser: Playwright, href: string) {
    await browser.eval((page) => {
      document.querySelector<HTMLAnchorElement>(`[href="${page}"]`)!.click()
    }, href)
  }

  function getInstantNavPanel(browser: Playwright) {
    // Wait up to 5s for the panel. elementByCssInstant's 10ms timeout flakes
    // badly under load; waitUntil:false because the page may not fire `load`
    // while the instant lock holds dynamic data, so we must not wait for it.
    return browser.elementByCss('.instant-nav-panel', { waitUntil: false })
  }

  async function getInstantNavPanelText(browser: Playwright): Promise<string> {
    return getInstantNavPanel(browser).text()
  }

  async function closePanelViaHeader(browser: Playwright) {
    return browser.elementByCss('#_next-devtools-panel-close').click()
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

    await getInstantNavPanel(browser)
    await waitForPanelRouterTransition()
  }

  async function isInstantNavPanelMounted(browser: Playwright) {
    return browser.eval(() => {
      const portal = document.querySelector('nextjs-portal')
      const root = portal?.shadowRoot ?? document
      return Boolean(root.querySelector('.instant-nav-panel'))
    })
  }

  async function triggerAppError(browser: Playwright) {
    await browser.eval(() => {
      document
        .querySelector<HTMLButtonElement>('[data-testid="trigger-error"]')!
        .click()
    })
  }

  async function waitForErrorToast(browser: Playwright) {
    await retry(async () => {
      const hasToast = await browser.eval(() => {
        const portal = document.querySelector('nextjs-portal')
        const root = portal?.shadowRoot ?? document
        return Boolean(root.querySelector('[data-issues-open]'))
      })
      expect(hasToast).toBe(true)
    })
  }

  async function clickErrorToast(browser: Playwright) {
    await browser.elementByCss('[data-issues-open]').click()
  }

  async function isErrorOverlayOpen(browser: Playwright): Promise<boolean> {
    // The overlay can linger in the DOM (hidden via React Activity) after
    // closing, so key on data-rendered="true" rather than mere presence.
    return browser.eval(() => {
      const portal = document.querySelector('nextjs-portal')
      const root = portal?.shadowRoot ?? document
      return Boolean(
        root.querySelector('[data-nextjs-dialog-overlay][data-rendered="true"]')
      )
    })
  }

  async function readInstantPanelZIndex(
    browser: Playwright
  ): Promise<number | null> {
    return browser.eval(() => {
      const portal = document.querySelector('nextjs-portal')
      const root = portal?.shadowRoot
      const el = root?.querySelector('.dynamic-panel-container')
      return el ? Number(getComputedStyle(el).zIndex) : null
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
    await getInstantNavPanel(browser)
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
      'Pause on navigations',
      'When enabled, every navigation will pause so you can inspect the loading shell before resuming.'
    )
  }

  async function expectPendingPanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Waiting for navigation',
      'Click any link or refresh the page to inspect the shell.',
      'Pause on navigations'
    )
  }

  async function expectMpaPanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Debugger paused',
      'Resume',
      'Loading shell',
      "You're viewing the shell for this page's initial load.",
      'TARGET'
    )
  }

  async function expectSpaPanel(browser: Playwright) {
    await expectInstantNavPanelText(
      browser,
      'Debugger paused',
      'Resume',
      'Loading shell',
      "You're viewing the shell for the current navigation.",
      'SOURCE',
      'TARGET'
    )
  }

  async function expectTargetPageMpaShell(browser: Playwright) {
    await browser
      .locator('[data-testid="dynamic-skeleton"]')
      .waitFor({ state: 'visible' })
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
    // With App Shell prefetching (the default), a captured SPA navigation shows
    // the same instant shell as an MPA page load: the static skeletons, with
    // runtime params and dynamic data held behind their Suspense boundaries
    // until the lock releases. (They are not baked into the prefetched shell.)
    await browser
      .locator('[data-testid="dynamic-skeleton"]')
      .waitFor({ state: 'visible' })
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

  // For a link with prefetch={true}, the per-page (runtime) data is prefetched,
  // so the captured SPA shell DOES include the resolved param and searchParam
  // values. Only the genuinely dynamic data (guarded by connection()) stays
  // behind its skeleton until the lock releases.
  async function expectTargetPageSpaShellWithRuntimeData(browser: Playwright) {
    await browser
      .locator('[data-testid="dynamic-skeleton"]')
      .waitFor({ state: 'visible' })
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

  async function expectPostLoadingAt(pathname: string, browser: Playwright) {
    await retry(
      async () => {
        expect(new URL(await browser.url()).pathname).toBe(pathname)
      },
      3_000,
      100
    )

    await browser
      .locator('[data-testid="post-loading"]')
      .first()
      .waitFor({ state: 'visible' })
  }

  async function expectPostRenderedAt(pathname: string, browser: Playwright) {
    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe(pathname)
      expect(await browser.elementByCss('[data-testid="post"]').text()).toBe(
        `Post ${pathname.split('/').pop()}`
      )
    })
  }

  async function expectAwaitConnectionPageLoading(browser: Playwright) {
    await retry(
      async () => {
        const text = await browser.elementByCss('body').text()
        expect(text).toContain('Loading await connection page...')
      },
      30_000,
      500
    )
    expect(
      await browser.locator('[data-testid="dynamic-content"]').count()
    ).toBe(0)
  }

  async function openHomeWithTargetPageWarmup() {
    const [browser] = await Promise.all([
      next.browser('/'),
      isNextDev && !isTurbopack
        ? // warmup target page compilation before clicking Start, to avoid extra flakiness.
          next.render('/target-page/my-post?search=foo').catch(() => {})
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
        expect(text).toContain('Pause on navigations')
        expect(text).toContain(
          'When enabled, every navigation will pause so you can inspect the loading shell before resuming.'
        )
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
      const browser = await next.browser('/target-page/my-post?search=foo')
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)

      await clickStartCapturing(browser)
      await browser.refresh()
      await getInstantNavPanel(browser)

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
        await getInstantNavPanel(browser)
        const text = await getInstantNavPanelText(browser)
        expect(text).toContain('Loading shell')
        expect(text).toContain(
          "You're viewing the shell for this page's initial load."
        )
      })

      // Clean up
      await clearInstantModeCookie(browser)
    })

    it('should reset the panel and app when pressing the close button from captured MPA state', async () => {
      const browser = await next.browser('/target-page/my-post?search=foo')
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await getInstantNavPanel(browser)
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
      const browser = await next.browser('/target-page/my-post?search=foo')
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await getInstantNavPanel(browser)
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
      await getInstantNavPanel(browser)

      await expectMpaPanel(browser)
      await browser
        .locator('[data-testid="mpa-dynamic-skeleton"]')
        .waitFor({ state: 'visible' })
      expect(
        await browser.locator('[data-testid="mpa-dynamic-content"]').count()
      ).toBe(0)
    })

    it('should restart capture and return to awaiting navigation after resuming from MPA state', async () => {
      const browser = await next.browser('/target-page/my-post?search=foo')
      await clearInstantModeCookie(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await browser.refresh()
      await getInstantNavPanel(browser)
      await expectMpaPanel(browser)
      await expectTargetPageMpaShell(browser)
      await waitForAppHydration(browser)

      await clickResume(browser)
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
        expect(text).toContain('Waiting for navigation')
        expect(text).toContain(
          'Click any link or refresh the page to inspect the shell.'
        )
        expect(text).toContain('Pause on navigations')
      })

      // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
      await clickLink(browser, '/target-page/my-post?search=foo')

      // Panel should transition to client navigation capture state
      await expectSpaPanel(browser)

      // Clean up
      await clearInstantModeCookie(browser)
    })

    it('should capture when CookieStore writes are not reflected in document.cookie', async () => {
      const browser = await openHomeWithTargetPageWarmup()
      await disableCookieStoreSet(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)

      await clearInstantModeCookie(browser)
    })

    it('should show loading skeleton during SPA navigation after clicking Start', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)

      // Click Start to activate the navigation lock
      await clickStartCapturing(browser)

      // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
      await clickLink(browser, '/target-page/my-post?search=foo')

      // Dynamic data should be suspended under the lock.
      await browser
        .locator('[data-testid="dynamic-skeleton"]')
        .waitFor({ state: 'visible' })
      expect(
        await browser.locator('[data-testid="dynamic-content"]').count()
      ).toBe(0)

      // Clean up
      await clearInstantModeCookie(browser)
    })

    it('should continue capturing loading navigations when starting on a dynamic route', async () => {
      const browser = await next.browser('/post/1')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="post"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await clickLink(browser, '/post/2')
      await expectSpaPanel(browser)
      await expectPostLoadingAt('/post/2', browser)

      await clickLink(browser, '/post/1')
      await expectPostLoadingAt('/post/1', browser)
    })

    it('should continue capturing loading navigations after starting on the home route', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await clickLink(browser, '/post/1')
      await expectSpaPanel(browser)
      await expectPostLoadingAt('/post/1', browser)

      await clickLink(browser, '/post/2')
      await expectPostLoadingAt('/post/2', browser)
    })

    it('should reset the panel and app when pressing the close button from captured SPA state', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)

      await closePanelViaHeader(browser)
      await waitForPanelRouterTransition()
      await waitForInstantModeCookieAbsent(browser)
      await expectTargetPageRendered(browser)

      await reopenInstantNavPanelFromMenu(browser)
      await expectIdlePanel(browser)
    })

    it('should keep params and searchParams RSC content suspended for a captured SPA navigation', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)

      await expectTargetPageSpaShell(browser)
    })

    it('should include runtime param and searchParam values in the captured SPA shell for a prefetch={true} link', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      // The prefetch link shares its href with #link-to-target, so select it
      // by id rather than by href.
      await browser.eval(() => {
        document
          .querySelector<HTMLAnchorElement>('#link-to-target-prefetch')!
          .click()
      })
      await expectSpaPanel(browser)

      await expectTargetPageSpaShellWithRuntimeData(browser)
    })

    it('should restart capture and return to awaiting navigation after resuming from SPA state', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)

      await clickResume(browser)
      await expectPendingPanel(browser)
      await expectTargetPageRendered(browser)
      await waitForInstantModeCookie(browser)
    })

    it('should resume rendering a captured await connection navigation with loading.tsx', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/await-connection')
      await expectSpaPanel(browser)
      await expectAwaitConnectionPageLoading(browser)

      await clickResume(browser)
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
      await getInstantNavPanel(browser)
      await expectMpaPanel(browser)

      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)
    })

    it('should avoid showing stale SPA state when reloading from a captured SPA state into captured MPA state', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)

      // The SPA capture (cookie -> spa) is recorded as soon as the prefetch
      // resolves, which can be before the navigation commits the new URL. Wait
      // for the URL to actually change to the target route before reloading,
      // otherwise browser.refresh() reloads the previous page (home) and we
      // capture an MPA load of the wrong route.
      await retry(async () => {
        expect(await browser.url()).toContain('/target-page/my-post')
      }, 10000)

      await browser.refresh()
      await getInstantNavPanel(browser)

      const initialPanelText = await getInstantNavPanelText(browser)
      expect(initialPanelText).toContain('Page load')
      expect(initialPanelText).not.toContain('Client nav')

      await expectMpaPanel(browser)
      await expectTargetPageMpaShell(browser)
    })
  })

  describe('history traversals', () => {
    it('re-arms the capture when navigating back from a captured SPA navigation', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)

      // The SPA capture is recorded as soon as the prefetch resolves, which
      // can be before the navigation commits the new URL. Wait for the URL to
      // change before traversing so back() returns to home.
      await retry(async () => {
        expect(await browser.url()).toContain('/target-page/my-post')
      }, 10000)

      await browser.back()

      // The traversal restores home with its real content.
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await retry(async () => {
        expect(await browser.url()).not.toContain('/target-page')
      })

      // The capture no longer corresponds to what's on screen, so the panel
      // returns to awaiting the next navigation, with the cookie still set.
      await expectPendingPanel(browser)
      await waitForInstantModeCookie(browser)

      // The next navigation is captured again. (The revisited route renders
      // from the navigation cache rather than showing the shell — same as a
      // recapture after Resume.)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
    })

    it('shows real content on forward after back while awaiting navigation', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
      await expectTargetPageSpaShell(browser)
      await retry(async () => {
        expect(await browser.url()).toContain('/target-page/my-post')
      }, 10000)

      await browser.back()
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await expectPendingPanel(browser)

      // The re-arm released the captured scope, so the target page's dynamic
      // data finished streaming in. Forward restores it with real content and
      // does not start a new capture.
      await browser.forward()
      await expectTargetPageRendered(browser)
      await expectPendingPanel(browser)
    })

    it('returns the panel to pending when navigating back after repeated captured navigations', async () => {
      const browser = await next.browser('/post/1')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="post"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      // Two captured navigations in a row. The second navigation takes over
      // the capture, releasing the first navigation's withheld data.
      await clickLink(browser, '/post/2')
      await expectSpaPanel(browser)
      await expectPostLoadingAt('/post/2', browser)

      await clickLink(browser, '/post/1')
      await expectPostLoadingAt('/post/1', browser)

      // Traversals are not captured, so going back resets the panel to
      // awaiting the next navigation, with the cookie still set. The revisited
      // page shows real content — its data was released when the second
      // navigation took over the capture.
      await browser.back()
      await expectPostRenderedAt('/post/2', browser)
      await expectPendingPanel(browser)
      await waitForInstantModeCookie(browser)

      // The traversal also released the current capture's withheld data, so
      // forward restores real content too and does not start a new capture.
      await browser.forward()
      await expectPostRenderedAt('/post/1', browser)
      await expectPendingPanel(browser)
    })

    it('captures a page load when reloading after back', async () => {
      const browser = await openHomeWithTargetPageWarmup()

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await clickLink(browser, '/target-page/my-post?search=foo')
      await expectSpaPanel(browser)
      await retry(async () => {
        expect(await browser.url()).toContain('/target-page/my-post')
      }, 10000)

      await browser.back()
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await expectPendingPanel(browser)

      await browser.refresh()
      await getInstantNavPanel(browser)
      await expectMpaPanel(browser)
    })
  })

  describe('capture lifecycle', () => {
    it('ends the capture when opening the menu via the logo', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      // Click the logo: opening the menu switches away from the instant panel,
      // which ends the capture.
      await toggleDevToolsIndicatorPopover(browser)
      await waitForPanelRouterTransition()

      // Leaving the panel for the menu releases the capture cookie.
      await waitForInstantModeCookieAbsent(browser)
    })

    it('ends the capture when pressing Escape (no error overlay open)', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await browser.keydown('Escape')
      await browser.keyup('Escape')

      await waitForPanelRouterTransition()
      await waitForInstantModeCookieAbsent(browser)
    })

    it('ends the capture when pressing the X close button', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await closePanelViaHeader(browser)

      await waitForPanelRouterTransition()
      await waitForInstantModeCookieAbsent(browser)
    })

    it('keeps the capture and panel mounted when opening the error overlay', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await expectPendingPanel(browser)

      await triggerAppError(browser)
      await waitForErrorToast(browser)
      await clickErrorToast(browser)
      await retry(async () => {
        expect(await isErrorOverlayOpen(browser)).toBe(true)
      })

      // Capture survives and the panel stays mounted behind the overlay.
      await waitForInstantModeCookie(browser)
      expect(await isInstantNavPanelMounted(browser)).toBe(true)

      await clearInstantModeCookie(browser)
    })

    it('keeps the instant panel behind the error overlay', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await triggerAppError(browser)
      await waitForErrorToast(browser)
      await clickErrorToast(browser)
      await retry(async () => {
        expect(await isErrorOverlayOpen(browser)).toBe(true)
      })

      await retry(async () => {
        const z = await readInstantPanelZIndex(browser)
        expect(z).not.toBeNull()
        expect(z).toBeLessThan(2147483646)
      })

      await clearInstantModeCookie(browser)
    })

    it('closes the error overlay first on Escape and keeps the capture', async () => {
      const browser = await next.browser('/')
      await clearInstantModeCookie(browser)
      await browser.waitForElementByCss('[data-testid="home-title"]')
      await waitForAppHydration(browser)

      await openInstantNavPanel(browser)
      await clickStartCapturing(browser)
      await triggerAppError(browser)
      await waitForErrorToast(browser)
      await clickErrorToast(browser)
      await retry(async () => {
        expect(await isErrorOverlayOpen(browser)).toBe(true)
      })

      // First Escape: the overlay closes, the capture survives.
      await browser.keydown('Escape')
      await browser.keyup('Escape')
      await retry(async () => {
        expect(await isErrorOverlayOpen(browser)).toBe(false)
      })
      await waitForInstantModeCookie(browser)
      expect(await isInstantNavPanelMounted(browser)).toBe(true)

      // Wait for the deferred errorOverlayOpenRef clear so the next ESC releases.
      await waitForPanelRouterTransition()

      // Second Escape: now the panel close releases the capture.
      await browser.keydown('Escape')
      await browser.keyup('Escape')
      await waitForInstantModeCookieAbsent(browser)

      await clearInstantModeCookie(browser)
    })
  })
})

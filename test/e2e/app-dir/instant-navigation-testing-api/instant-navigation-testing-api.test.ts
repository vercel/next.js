/**
 * Tests for the Instant Navigation Testing API.
 *
 * The `instant` helper allows tests to assert on the prefetched UI state
 * before dynamic data streams in. This enables deterministic testing of
 * loading states without race conditions.
 *
 * Usage example:
 *
 *   await instant(page, async () => {
 *     await page.click('a[href="/products/123"]')
 *     // Assert on the prefetched loading UI
 *     await expect(page.locator('[data-testid="loading-shell"]')).toBeVisible()
 *     // Dynamic content hasn't streamed in yet
 *     expect(await page.locator('[data-testid="price"]').count()).toBe(0)
 *   })
 *   // After exiting instant(), dynamic content streams in
 *   await expect(page.locator('[data-testid="price"]')).toBeVisible()
 *
 * NOTE: This API is not exposed in production builds by default. These tests
 * use the experimental.exposeTestingApiInProductionBuild flag to enable the
 * API in production mode for testing purposes.
 */

import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

describe('instant-navigation-testing-api', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Skip deployment tests because the exposeTestingApiInProductionBuild flag
    // doesn't exist in the production version of Next.js yet
    skipDeployment: true,
  })

  /**
   * Opens a browser and returns the underlying Playwright Page instance.
   *
   * We use this pattern so our test assertions look as close as possible to
   * what users would write with the actual Playwright helper package. The
   * Next.js test infra wraps Playwright with its own BrowserInterface, but
   * the Instant Navigation Testing API is designed to work with native Playwright.
   */
  async function openPage(url: string): Promise<Playwright.Page> {
    let page: Playwright.Page
    await next.browser(url, {
      beforePageLoad(p) {
        page = p
      },
    })
    return page!
  }

  const INSTANT_COOKIE = 'next-instant-navigation-testing'

  /**
   * Runs a function with instant navigation enabled. Within this scope,
   * navigations render the prefetched UI immediately and wait for the
   * callback to complete before streaming in dynamic data.
   *
   * Uses the cookie-based protocol: setting the cookie acquires the
   * navigation lock (via CookieStore change event), and clearing it
   * releases the lock.
   */
  async function instant<T>(
    page: Playwright.Page,
    fn: () => Promise<T>
  ): Promise<T> {
    // Acquire the lock by setting the cookie from within the page context.
    // This triggers the CookieStore change event in navigation-testing-lock.ts,
    // which acquires the in-memory navigation lock.
    await page.evaluate((name) => {
      document.cookie = name + '=1; path=/'
    }, INSTANT_COOKIE)
    try {
      return await fn()
    } finally {
      // Release the lock by clearing the cookie. For SPA navigations, this
      // triggers the CookieStore change event which resolves the in-memory
      // lock. For MPA navigations (reload, plain anchor), the listener in
      // app-bootstrap.ts triggers a page reload to fetch dynamic data.
      await page.evaluate((name) => {
        document.cookie = name + '=; path=/; max-age=0'
      }, INSTANT_COOKIE)
    }
  }

  it('renders prefetched loading shell instantly during navigation', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      await page.click('#link-to-target')

      // The loading shell appears immediately, without waiting for dynamic data
      const loadingShell = page.locator('[data-testid="loading-shell"]')
      await loadingShell.waitFor({ state: 'visible' })
      expect(await loadingShell.textContent()).toContain(
        'Loading target page...'
      )

      // Dynamic content has not streamed in yet
      const dynamicContent = page.locator('[data-testid="dynamic-content"]')
      expect(await dynamicContent.count()).toBe(0)
    })

    // After exiting the instant scope, dynamic content streams in
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })

  it('renders runtime-prefetched content instantly during navigation', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      await page.click('#link-to-runtime-prefetch')

      // Content that depends on search params appears immediately because
      // it was included in the runtime prefetch
      const searchParamValue = page.locator(
        '[data-testid="search-param-value"]'
      )
      await searchParamValue.waitFor({ state: 'visible' })
      expect(await searchParamValue.textContent()).toContain(
        'myParam: testValue'
      )

      // The loading state for dynamic content is visible
      const innerLoading = page.locator('[data-testid="inner-loading"]')
      await innerLoading.waitFor({ state: 'visible' })
      expect(await innerLoading.textContent()).toContain(
        'Loading dynamic content...'
      )

      // Dynamic content has not streamed in yet
      const dynamicContent = page.locator('[data-testid="dynamic-content"]')
      expect(await dynamicContent.count()).toBe(0)
    })

    // After exiting the instant scope, dynamic content streams in
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )

    // Search param content remains visible
    const searchParamValue = page.locator('[data-testid="search-param-value"]')
    expect(await searchParamValue.textContent()).toContain('myParam: testValue')
  })

  it('renders full prefetch content instantly when prefetch={true}', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      await page.click('#link-to-full-prefetch')

      // With prefetch={true}, the dynamic content is included in the prefetch
      // response, so it appears immediately without a loading state
      const content = page.locator('[data-testid="full-prefetch-content"]')
      await content.waitFor({ state: 'visible' })
      expect(await content.textContent()).toContain(
        'Full prefetch content loaded'
      )
    })
  })

  it('logs an error when attempting to nest instant scopes', async () => {
    const page = await openPage('/')

    // Listen for the specific error message
    const consolePromise = page.waitForEvent('console', {
      predicate: (msg) =>
        msg.type() === 'error' && msg.text().includes('already acquired'),
      timeout: 5000,
    })

    await instant(page, async () => {
      // Attempt to acquire the lock again by changing the cookie value.
      // The CookieStore change event fires, and the handler detects that
      // the lock is already held, logging an error.
      await page.evaluate((name) => {
        document.cookie = name + '=nested; path=/'
      }, INSTANT_COOKIE)
      const msg = await consolePromise
      expect(msg.text()).toContain('already acquired')
    })
  })

  it('renders static shell on page reload', async () => {
    const page = await openPage('/target-page')

    // Wait for the page to fully load with dynamic content
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })

    await instant(page, async () => {
      // Reload the page while in instant mode
      await page.reload()

      // The loading shell appears, but dynamic content is blocked
      const loadingShell = page.locator('[data-testid="loading-shell"]')
      await loadingShell.waitFor({ state: 'visible' })
      expect(await loadingShell.textContent()).toContain(
        'Loading target page...'
      )

      // Dynamic content has not streamed in yet
      expect(await dynamicContent.count()).toBe(0)
    })

    // After exiting the instant scope, dynamic content streams in
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })

  it('renders static shell on MPA navigation via plain anchor', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      // Navigate using a plain anchor (triggers full page load)
      await page.click('#plain-link-to-target')

      // The loading shell appears, but dynamic content is blocked
      const loadingShell = page.locator('[data-testid="loading-shell"]')
      await loadingShell.waitFor({ state: 'visible' })
      expect(await loadingShell.textContent()).toContain(
        'Loading target page...'
      )

      // Dynamic content has not streamed in yet
      const dynamicContent = page.locator('[data-testid="dynamic-content"]')
      expect(await dynamicContent.count()).toBe(0)
    })

    // After exiting the instant scope, dynamic content streams in
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible', timeout: 10000 })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })

  it('reload followed by MPA navigation, both block dynamic data', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      // Reload the page while in instant mode
      await page.reload()

      // Home page should be visible (static content)
      const homeTitle = page.locator('[data-testid="home-title"]')
      await homeTitle.waitFor({ state: 'visible' })

      // Navigate via plain anchor (MPA navigation)
      await page.click('#plain-link-to-target')

      // The loading shell appears, but dynamic content is blocked
      const loadingShell = page.locator('[data-testid="loading-shell"]')
      await loadingShell.waitFor({ state: 'visible' })

      // Dynamic content has not streamed in yet
      const dynamicContent = page.locator('[data-testid="dynamic-content"]')
      expect(await dynamicContent.count()).toBe(0)
    })

    // After exiting the instant scope, dynamic content streams in
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })

  it('successive MPA navigations within instant scope', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      // First MPA navigation: reload
      await page.reload()
      const homeTitle = page.locator('[data-testid="home-title"]')
      await homeTitle.waitFor({ state: 'visible' })

      // Second MPA navigation: go to target page
      await page.click('#plain-link-to-target')

      // Static shell is visible
      const loadingShell = page.locator('[data-testid="loading-shell"]')
      await loadingShell.waitFor({ state: 'visible' })

      // Dynamic content is blocked
      const dynamicContent = page.locator('[data-testid="dynamic-content"]')
      expect(await dynamicContent.count()).toBe(0)

      // Third MPA navigation: go back to home
      await page.goBack()
      await homeTitle.waitFor({ state: 'visible' })

      // Fourth MPA navigation: go to target page again
      await page.click('#plain-link-to-target')

      // Still shows static shell, dynamic content still blocked
      await loadingShell.waitFor({ state: 'visible' })
      expect(await dynamicContent.count()).toBe(0)
    })

    // After exiting instant scope, dynamic content streams in
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })

  it('subsequent navigations after instant scope are not locked', async () => {
    const page = await openPage('/')

    // First, do an MPA navigation within an instant scope
    await instant(page, async () => {
      await page.reload()
      const homeTitle = page.locator('[data-testid="home-title"]')
      await homeTitle.waitFor({ state: 'visible' })
    })

    // After exiting the instant scope, navigations work normally again
    // Client-side navigation should load dynamic content
    await page.click('#link-to-target')
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )

    // Navigate back to home
    await page.goBack()
    const homeTitle = page.locator('[data-testid="home-title"]')
    await homeTitle.waitFor({ state: 'visible' })

    // Another MPA navigation (reload) should also work normally
    await page.goto(page.url().replace(/\/$/, '') + '/target-page')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })
})

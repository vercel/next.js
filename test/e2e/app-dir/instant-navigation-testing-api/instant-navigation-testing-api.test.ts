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
import { instant } from '@next/playwright'
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
      // Attempt to acquire the lock again by nesting instant() calls.
      // The inner call sets the cookie again, and the handler detects
      // that the lock is already held, logging an error.
      await instant(page, async () => {})
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

  // Verifies that runtime params (cookies, dynamic route params, search
  // params) are excluded from the instant navigation shell. The shell should
  // only contain static content — runtime param values should be blocked
  // behind a Suspense boundary until the instant lock is released.
  //
  // Each test route reads a different runtime param inside a <Suspense>
  // boundary without opting into `unstable_instant: { prefetch: 'runtime' }`.
  // During the instant scope, the static page title should be visible and the
  // Suspense fallback should be shown, but the resolved param value should
  // NOT be present.
  describe('runtime params are excluded from instant shell', () => {
    it('does not include cookie values in instant shell during client navigation', async () => {
      const page = await openPage('/')

      // Set a test cookie
      await page.evaluate(() => {
        document.cookie = 'testCookie=hello; path=/'
      })

      await instant(page, async () => {
        await page.click('#link-to-cookies-page')

        // Static page title is visible
        const title = page.locator('[data-testid="cookies-page-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator('[data-testid="cookies-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        // Cookie value is NOT in the shell
        const cookieValue = page.locator('[data-testid="cookie-value"]')
        expect(await cookieValue.count()).toBe(0)
      })

      // After exiting instant scope, cookie value streams in
      const cookieValue = page.locator('[data-testid="cookie-value"]')
      await cookieValue.waitFor({ state: 'visible' })
      expect(await cookieValue.textContent()).toContain('testCookie: hello')
    })

    it('does not include dynamic param values in instant shell during client navigation', async () => {
      const page = await openPage('/')

      await instant(page, async () => {
        await page.click('#link-to-dynamic-params')

        // Static page title is visible
        const title = page.locator('[data-testid="dynamic-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator('[data-testid="params-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        // Param value is NOT in the shell
        const paramValue = page.locator('[data-testid="param-value"]')
        expect(await paramValue.count()).toBe(0)
      })

      // After exiting instant scope, param value streams in
      const paramValue = page.locator('[data-testid="param-value"]')
      await paramValue.waitFor({ state: 'visible' })
      expect(await paramValue.textContent()).toContain('slug: hello')
    })

    it('does not include search param values in instant shell during client navigation', async () => {
      const page = await openPage('/')

      await instant(page, async () => {
        await page.click('#link-to-search-params')

        // Static page title is visible
        const title = page.locator('[data-testid="search-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator('[data-testid="search-params-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        // Search param content is NOT in the shell
        const searchParamContent = page.locator(
          '[data-testid="search-param-content"]'
        )
        expect(await searchParamContent.count()).toBe(0)
      })

      // After exiting instant scope, search param content streams in
      const searchParamContent = page.locator(
        '[data-testid="search-param-content"]'
      )
      await searchParamContent.waitFor({ state: 'visible' })
      expect(await searchParamContent.textContent()).toContain('foo: bar')
    })

    it('does not include cookie values in instant shell during page load', async () => {
      const page = await openPage('/')

      // Set a test cookie
      await page.evaluate(() => {
        document.cookie = 'testCookie=hello; path=/'
      })

      await instant(page, async () => {
        await page.click('#plain-link-to-cookies-page')

        // Static page title is visible
        const title = page.locator('[data-testid="cookies-page-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator('[data-testid="cookies-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        // Cookie value is NOT in the shell
        const cookieValue = page.locator('[data-testid="cookie-value"]')
        expect(await cookieValue.count()).toBe(0)
      })

      // After exiting instant scope, cookie value streams in
      const cookieValue = page.locator('[data-testid="cookie-value"]')
      await cookieValue.waitFor({ state: 'visible', timeout: 10000 })
      expect(await cookieValue.textContent()).toContain('testCookie: hello')
    })

    it('does not include dynamic param values in instant shell during page load', async () => {
      const page = await openPage('/')

      await instant(page, async () => {
        await page.click('#plain-link-to-dynamic-params')

        // Static page title is visible
        const title = page.locator('[data-testid="dynamic-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator('[data-testid="params-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        // Param value is NOT in the shell
        const paramValue = page.locator('[data-testid="param-value"]')
        expect(await paramValue.count()).toBe(0)
      })

      // After exiting instant scope, param value streams in
      const paramValue = page.locator('[data-testid="param-value"]')
      await paramValue.waitFor({ state: 'visible', timeout: 10000 })
      expect(await paramValue.textContent()).toContain('slug: hello')
    })

    it('does not include search param values in instant shell during page load', async () => {
      const page = await openPage('/')

      await instant(page, async () => {
        await page.click('#plain-link-to-search-params')

        // Static page title is visible
        const title = page.locator('[data-testid="search-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator('[data-testid="search-params-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        // Search param content is NOT in the shell
        const searchParamContent = page.locator(
          '[data-testid="search-param-content"]'
        )
        expect(await searchParamContent.count()).toBe(0)
      })

      // After exiting instant scope, search param content streams in
      const searchParamContent = page.locator(
        '[data-testid="search-param-content"]'
      )
      await searchParamContent.waitFor({ state: 'visible', timeout: 10000 })
      expect(await searchParamContent.textContent()).toContain('foo: bar')
    })
  })

  // In dev mode, hover/intent-based prefetches should not send requests
  // that produce stale segment data. If a hover prefetch caches the route
  // with resolved runtime data before the instant lock is acquired, params
  // will leak into the shell when instant mode is later enabled.
  it('does not leak runtime data from hover prefetch into instant shell', async () => {
    const page = await openPage('/')

    // Hover over the dynamic params link to trigger an intent prefetch
    await page.hover('#link-to-dynamic-params')

    // Wait for the prefetch to complete
    await page.waitForTimeout(3000)

    // Now enable instant mode and navigate
    await instant(page, async () => {
      await page.click('#link-to-dynamic-params')

      // Static page title is visible
      const title = page.locator('[data-testid="dynamic-params-title"]')
      await title.waitFor({ state: 'visible' })

      // Suspense fallback is visible
      const fallback = page.locator('[data-testid="params-fallback"]')
      await fallback.waitFor({ state: 'visible' })

      // Param value is NOT in the shell — even though a hover prefetch
      // ran before the instant lock was acquired
      const paramValue = page.locator('[data-testid="param-value"]')
      expect(await paramValue.count()).toBe(0)
    })

    // After exiting instant scope, param value streams in
    const paramValue = page.locator('[data-testid="param-value"]')
    await paramValue.waitFor({ state: 'visible' })
    expect(await paramValue.textContent()).toContain('slug: hello')
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

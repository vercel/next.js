/**
 * Tests for the Instant Navigation Testing API without Cache Components.
 *
 * This is a companion to the instant-navigation-testing-api suite, which has
 * cacheComponents: true. This suite verifies the API also works with the
 * legacy prefetch model where there's no PPR / per-segment caching.
 *
 * Without Cache Components:
 *   - Default prefetch renders up to the first loading.tsx boundary
 *   - prefetch={true} eagerly prefetches the full page including dynamic data
 *   - MPA navigations have no static shell concept (all-or-nothing), so the
 *     MPA tests from the cache-components suite have no analog here
 *
 * Tests NOT ported from the cache-components suite:
 *   - "renders runtime-prefetched content instantly" — unstable_instant with
 *     runtime prefetch requires Cache Components
 *   - All 5 MPA tests (reload, plain anchor, successive, hydration) — no PPR
 *     shell without Cache Components
 */

import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'

describe('instant-navigation-testing-api-without-cache-components', () => {
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
   * the Instant Navigation Testing API is designed to work with native
   * Playwright.
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

  /**
   * Runs a function with instant navigation enabled. Within this scope,
   * navigations render the prefetched UI immediately and wait for the
   * callback to complete before streaming in dynamic data.
   *
   * This is the inline implementation of what will eventually be extracted
   * to a Playwright helper package.
   */
  async function instant<T>(
    page: Playwright.Page,
    fn: () => Promise<T>
  ): Promise<T> {
    await page.evaluate(() =>
      (window as any).__EXPERIMENTAL_NEXT_TESTING__?.navigation.lock()
    )
    try {
      return await fn()
    } finally {
      // Wait for the page to be ready before unlocking. This is only necessary
      // when fn() triggers a full page navigation (e.g. page.reload() or
      // clicking a plain anchor), since the new page needs time to initialize.
      await page.waitForFunction(
        () =>
          typeof (window as any).__EXPERIMENTAL_NEXT_TESTING__ !== 'undefined'
      )
      await page.evaluate(() =>
        (window as any).__EXPERIMENTAL_NEXT_TESTING__?.navigation.unlock()
      )
    }
  }

  it('renders prefetched loading shell instantly during navigation', async () => {
    const page = await openPage('/')

    await instant(page, async () => {
      await page.click('#link-to-target')

      // The loading shell appears immediately, without waiting for
      // dynamic data
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

    await instant(page, async () => {
      // Wait for the console error that fires when a nested lock is attempted.
      const consoleError = page.waitForEvent('console', {
        predicate: (msg) =>
          msg.type() === 'error' && msg.text().includes('already acquired'),
      })
      // Attempt to nest another instant scope — should log an error
      await instant(page, async () => {})
      await consoleError
    })
  })

  it('subsequent navigations after instant scope are not locked', async () => {
    const page = await openPage('/')

    // Use full prefetch link since it works in both dev and prod modes
    await instant(page, async () => {
      await page.click('#link-to-full-prefetch')

      const content = page.locator('[data-testid="full-prefetch-content"]')
      await content.waitFor({ state: 'visible' })
    })

    // Navigate back to home
    await page.goBack()
    const homeTitle = page.locator('[data-testid="home-title"]')
    await homeTitle.waitFor({ state: 'visible' })

    // After exiting the instant scope, navigations work normally again.
    // Navigate to target page — dynamic content should load without blocking.
    await page.click('#link-to-target')
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
  })
})

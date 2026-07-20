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

import {
  NextInstance,
  nextTestSetup,
  isNextDev,
  type Playwright as NextBrowser,
} from 'e2e-utils'
import { instant } from '@next/playwright'
import { assertNoConsoleErrors } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { join } from 'node:path'

/**
 * Opens a browser and returns the underlying Playwright Page instance.
 *
 * We use this pattern so our test assertions look as close as possible to
 * what users would write with the actual Playwright helper package. The
 * Next.js test infra wraps Playwright with its own BrowserInterface, but
 * the Instant Navigation Testing API is designed to work with native Playwright.
 */
// The browser and full-document navigation requests for the currently running
// test. openPage populates these so a shared afterEach can assert there were no
// console errors (e.g. a failed hydration) and individual tests can assert that
// releasing the instant lock resolves client-side instead of hard reloading.
let activeBrowser: NextBrowser | undefined
let navigationRequests: string[] = []

async function openPage(
  next: NextInstance,
  url: string,
  options?: { cookies?: Array<{ name: string; value: string }> }
): Promise<Playwright.Page> {
  let page: Playwright.Page
  navigationRequests = []
  activeBrowser = await next.browser(url, {
    // Surface uncaught page errors (e.g. a failed hydration) as console logs so
    // assertNoConsoleErrors fails the test on them.
    pushErrorAsConsoleLog: true,
    beforePageLoad(p) {
      page = p
      // Record full-document navigations so tests can assert that releasing the
      // instant lock does not trigger a hard reload.
      p.on('request', (request) => {
        if (request.isNavigationRequest()) {
          navigationRequests.push(new URL(request.url()).pathname)
        }
      })
      if (options?.cookies) {
        const { hostname } = new URL(next.url)
        p.context().addCookies(
          options.cookies.map((c) => ({
            ...c,
            domain: hostname,
            path: '/',
          }))
        )
      }
    },
  })
  // Lower the per-action timeout below jest's 60s test timeout so a stalling
  // waitFor fails with its own locator (naming the element that never appeared)
  // instead of a bare test-level timeout that hides which assertion hung.
  page.setDefaultTimeout(20_000)
  return page
}

afterEach(async () => {
  if (activeBrowser) {
    // Console-error checking targets production minified React errors (e.g. a
    // failed hydration on deploy, which is how the instant bootstrap regression
    // surfaced). Development legitimately logs warnings here (such as a
    // blocking-route prerender insight), so only assert in production.
    if (!isNextDev) {
      await assertNoConsoleErrors(activeBrowser)
    }
    activeBrowser = undefined
  }
})

describe('instant-navigation-testing-api', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'default'),
  })

  it('renders prefetched loading shell instantly during navigation', async () => {
    const page = await openPage(next, '/')

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

    // After exiting the instant scope, dynamic content streams in. Releasing
    // the lock must resolve client-side rather than hard reloading the
    // document.
    const navigationsAtUnlock = navigationRequests.length
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
    expect(navigationRequests.length).toBe(navigationsAtUnlock)
  })

  it('renders runtime-prefetched content instantly during navigation', async () => {
    const page = await openPage(next, '/')

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

  // Navigate deeper under the lock. Loading `/blocking-fallback/en` commits the
  // parent layout (which owns the only <Suspense> boundary) and the landing
  // page. `/blocking-fallback/en/s1` is a fallback route (`[scope]` has no
  // generateStaticParams) whose deeper page awaits the uncovered `scope` param
  // and reads `cookies()`. Awaiting the withheld param is what keeps the
  // segment out of the app shell (the app shell is allowed to read cookies, so
  // a cookie read alone would not park it). Navigating into it must stay
  // parked: the committed parent and landing page stay on screen, the deeper
  // page (its title and its cookie value) must not commit while the lock is
  // held, and they stream in only after release.
  it('keeps the committed layout and defers a deeper blocking segment under instant()', async () => {
    const page = await openPage(next, '/blocking-fallback/en', {
      cookies: [{ name: 'testCookie', value: 'hello' }],
    })
    await page
      .locator('[data-testid="blocking-landing"]')
      .waitFor({ state: 'visible' })

    await instant(page, async () => {
      await page.click('#to-blocking-scope')

      const secret = page.locator('[data-testid="blocking-secret"]')
      // Poll past the point where the navigation previously committed,
      // breaking early if the destination leaks so a regression fails fast.
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(1000)
        if (await secret.count()) break
      }

      // The parent layout's Suspense already resolved on the landing page, so
      // navigating deeper does NOT re-show its fallback; React keeps the
      // previous page on screen until the blocking destination resolves. So
      // under the lock the committed parent and landing page stay put, and the
      // deeper blocking page (and its cookie read) must not commit.
      expect(
        await page.locator('[data-testid="blocking-parent"]').count()
      ).toBe(1)
      expect(
        await page.locator('[data-testid="blocking-landing"]').count()
      ).toBe(1)
      expect(
        await page.locator('[data-testid="blocking-scope-title"]').count()
      ).toBe(0)
      expect(await secret.count()).toBe(0)
    })

    // After the lock releases, the deeper page and cookie value stream in.
    const secret = page.locator('[data-testid="blocking-secret"]')
    await secret.waitFor({ state: 'visible' })
    expect(await secret.textContent()).toContain('testCookie: hello')
  })

  it('renders full prefetch content instantly when prefetch={true}', async () => {
    const page = await openPage(next, '/')

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

  it('throws when attempting to nest instant scopes', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      // Attempt to acquire the lock again by nesting instant() calls.
      // The inner call detects the cookie is already set and throws
      // before touching the browser state.
      let caughtError: Error | undefined
      try {
        await instant(page, async () => {})
      } catch (e) {
        caughtError = e as Error
      }
      expect(caughtError).toBeDefined()
      expect(caughtError!.message).toContain('already active')
    })
  })

  it('recovers from a stale instant cookie left by a prior scope', async () => {
    const page = await openPage(next, '/')

    // Simulate a cookie leaked by a previous instant() scope. A locked MPA page
    // load re-writes the cookie asynchronously and can resurrect it right after
    // a prior scope's release deletes it, leaving a captured-state entry in the
    // shared browser context. Because the context is reused across tests, a new
    // instant() call must treat that residue as stale (clearing it) rather than
    // reporting an active scope, or every following test would cascade-fail.
    const { hostname } = new URL(next.url)
    await page.context().addCookies([
      {
        name: 'next-instant-navigation-testing',
        value: JSON.stringify([1, 'c-stale', null]),
        domain: hostname,
        path: '/',
      },
    ])

    let ranCallback = false
    await instant(page, async () => {
      ranCallback = true
      await page.click('#link-to-target')
      const loadingShell = page.locator('[data-testid="loading-shell"]')
      await loadingShell.waitFor({ state: 'visible' })
    })
    expect(ranCallback).toBe(true)

    // After exiting the scope the cookie is gone again, so a normal navigation
    // is not locked and dynamic content streams in.
    const dynamicContent = page.locator('[data-testid="dynamic-content"]')
    await dynamicContent.waitFor({ state: 'visible' })
  })

  it('allows concurrent instant scopes across separate browser contexts', async () => {
    const page = await openPage(next, '/')

    // A second, independent browser context. Its cookie jar and its page's
    // navigation lock are separate from the first context's, so a concurrent
    // instant() scope here must not be reported as already active against the
    // first. This guards against tracking the active scope per-process instead
    // of per-context.
    const browser = page.context().browser()
    if (!browser) {
      throw new Error('Expected the page context to expose a browser instance')
    }
    const otherContext = await browser.newContext()
    try {
      const otherPage = await otherContext.newPage()
      await otherPage.goto(next.url)

      let ranFirst = false
      let ranSecond = false
      await Promise.all([
        instant(page, async () => {
          ranFirst = true
          await page.click('#link-to-target')
          await page
            .locator('[data-testid="loading-shell"]')
            .waitFor({ state: 'visible' })
        }),
        instant(otherPage, async () => {
          ranSecond = true
          await otherPage.click('#link-to-target')
          await otherPage
            .locator('[data-testid="loading-shell"]')
            .waitFor({ state: 'visible' })
        }),
      ])
      expect(ranFirst).toBe(true)
      expect(ranSecond).toBe(true)
    } finally {
      await otherContext.close()
    }
  })

  it('renders shell on page reload', async () => {
    const page = await openPage(next, '/target-page')

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

      // Wait for the instant-mode hydration to finish before releasing the
      // lock. This mirrors real usage, where the cookie is cleared (e.g. via
      // DevTools) after the page is interactive, so the unlock resolves
      // client-side. Releasing before hydration completes intentionally falls
      // back to a hard reload (see refreshOnInstantNavigationUnlock).
      await page.waitForFunction(
        () => (globalThis as any).__NEXT_HYDRATED === true
      )
    })

    // After exiting the instant scope, dynamic content streams in. Releasing
    // the lock must resolve client-side rather than hard reloading the
    // document.
    const navigationsAtUnlock = navigationRequests.length
    await dynamicContent.waitFor({ state: 'visible' })
    expect(await dynamicContent.textContent()).toContain(
      'Dynamic content loaded'
    )
    expect(navigationRequests.length).toBe(navigationsAtUnlock)
  })

  it('renders shell on MPA navigation via plain anchor', async () => {
    const page = await openPage(next, '/')

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
    const page = await openPage(next, '/')

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
    const page = await openPage(next, '/')

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

      // Still shows shell, dynamic content still blocked
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

  // Cookies are session data carried by the app shell, so on a client
  // navigation they ARE available in the instant shell — unless a param is read
  // before the cookie, which makes the app-shell render suspend at the
  // (withheld) param before it reaches the cookie. On a full page load the
  // document render defers the cookie regardless.
  describe('cookies in the instant shell', () => {
    // Skipped: `/cookies-page` is a non-partial route (it opts into neither
    // `partialPrefetching` nor a per-route `prefetch`/`instant` config), so its
    // speculative static prefetch is fuller than the app-shell render and
    // supersedes it in the segment cache if it's applied last. The cookie that
    // only the app shell carries is dropped before it reaches the instant
    // shell, and #95150's shell handling only engages under partial
    // prefetching, so it does not cover this case.
    //
    // If we later detect that a route reads cookies during app-shell
    // generation, we should opt it into either partial prefetching, so that
    // only the app shell is fetched on the client, or runtime prefetching, so
    // that a speculative prefetch can never regress the content an app shell
    // initially showed, and cookie-dependent content is not removed once a
    // speculative prefetch (for a link whose instant app shell we already
    // displayed) has settled.
    it.skip('includes app-shell cookie values in the instant shell during client navigation', async () => {
      const page = await openPage(next, '/', {
        cookies: [{ name: 'testCookie', value: 'hello' }],
      })

      await instant(page, async () => {
        await page.click('#link-to-cookies-page')

        const title = page.locator('[data-testid="cookies-page-title"]')
        await title.waitFor({ state: 'visible' })

        // Cookies are session data in the app shell, and nothing gates them,
        // so the value should be available inside the instant scope.
        const cookieValue = page.locator('[data-testid="cookie-value"]')
        // Expected-failing today (see the note above): the cookie never reaches
        // the shell, so cap the wait rather than spend the default 60s on a
        // known timeout. A real fix puts the cookie in the same captured shell
        // as the title above, so it surfaces well within this.
        await cookieValue.waitFor({ state: 'visible', timeout: 3000 })
        expect(await cookieValue.textContent()).toContain('testCookie: hello')
      })
    })

    it('excludes a cookie read after a param access from the instant shell during client navigation', async () => {
      const page = await openPage(next, '/', {
        cookies: [{ name: 'testCookie', value: 'hello' }],
      })

      await instant(page, async () => {
        await page.click('#link-to-cookies-with-param')

        const title = page.locator('[data-testid="cookies-param-title"]')
        await title.waitFor({ state: 'visible' })

        // The component awaits `params` before `cookies()`. The app shell
        // withholds params, so it suspends before the cookie read — the cookie
        // value is NOT in the instant shell; its Suspense fallback is shown.
        const fallback = page.locator('[data-testid="cookies-param-fallback"]')
        await fallback.waitFor({ state: 'visible' })
        expect(
          await page.locator('[data-testid="cookies-param-value"]').count()
        ).toBe(0)
      })

      // After exiting the instant scope, the cookie value streams in.
      const cookieValue = page.locator('[data-testid="cookies-param-value"]')
      await cookieValue.waitFor({ state: 'visible' })
      expect(await cookieValue.textContent()).toContain('testCookie: hello')
    })

    it('does not include cookie values in instant shell during page load', async () => {
      const page = await openPage(next, '/', {
        cookies: [{ name: 'testCookie', value: 'hello' }],
      })

      await instant(page, async () => {
        await page.click('#plain-link-to-cookies-page')

        const title = page.locator('[data-testid="cookies-page-title"]')
        await title.waitFor({ state: 'visible' })

        const fallback = page.locator('[data-testid="cookies-fallback"]')
        await fallback.waitFor({ state: 'visible' })

        const cookieValue = page.locator('[data-testid="cookie-value"]')
        expect(await cookieValue.count()).toBe(0)
      })

      // After exiting instant scope, cookie value streams in
      const cookieValue = page.locator('[data-testid="cookie-value"]')
      await cookieValue.waitFor({ state: 'visible', timeout: 10000 })
      expect(await cookieValue.textContent()).toContain('testCookie: hello')
    })
  })

  // Verifies that search params are excluded from the instant navigation shell.
  // The shell should only contain static content — these runtime values should
  // be blocked behind a Suspense boundary until the instant lock is released.
  // (Cookies are session data carried by the app shell, and dynamic route
  // params without `generateStaticParams` are covered separately below.)
  //
  // The route reads the search param inside a <Suspense> boundary without
  // opting into `instant: { prefetch: 'runtime' }`. During the instant scope,
  // the static page title should be visible and the Suspense fallback should be
  // shown, but the resolved value should NOT be present.
  describe('search params are excluded from instant shell', () => {
    it('does not include search param values in instant shell during client navigation', async () => {
      const page = await openPage(next, '/')

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

    it('does not include search param values in instant shell during page load', async () => {
      const page = await openPage(next, '/')

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

  describe('statically generated params are included in instant shell', () => {
    it('includes statically generated param values in instant shell during client navigation', async () => {
      const page = await openPage(next, '/')

      await instant(page, async () => {
        await page.click('#link-to-static-params')

        // Static page title is visible
        const title = page.locator('[data-testid="static-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Param value IS in the shell (slug 'hello' is in generateStaticParams)
        const paramValue = page.locator('[data-testid="static-param-value"]')
        await paramValue.waitFor({ state: 'visible' })
        expect(await paramValue.textContent()).toContain('slug: hello')

        // Suspense fallback is NOT visible
        const fallback = page.locator('[data-testid="static-params-fallback"]')
        expect(await fallback.count()).toBe(0)
      })
    })

    it('includes statically generated param values in instant shell during page load', async () => {
      const page = await openPage(next, '/')

      await instant(page, async () => {
        await page.click('#plain-link-to-static-params')

        // Static page title is visible
        const title = page.locator('[data-testid="static-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Param value IS in the shell (slug 'hello' is in generateStaticParams)
        const paramValue = page.locator('[data-testid="static-param-value"]')
        await paramValue.waitFor({ state: 'visible' })
        expect(await paramValue.textContent()).toContain('slug: hello')

        // Suspense fallback is NOT visible
        const fallback = page.locator('[data-testid="static-params-fallback"]')
        expect(await fallback.count()).toBe(0)
      })
    })
  })

  // A route with no `generateStaticParams` is never fallback-upgradeable, so a
  // concrete param render is never cached back into the static prefetch shell.
  // The param read therefore stays a dynamic write behind the Suspense boundary
  // and is gated by the instant lock — it must never appear in the instant
  // shell, regardless of how the navigation is triggered. (A route that does
  // define `generateStaticParams` is exercised above; there a non-listed param
  // legitimately upgrades to static after its first render, so it is not a
  // reliable runtime value to assert exclusion on.)
  describe('dynamic route params without generateStaticParams are excluded from instant shell', () => {
    it('during client navigation', async () => {
      const page = await openPage(next, '/')

      await instant(page, async () => {
        await page.click('#link-to-ungenerated-params')

        // Suspense fallback is visible in the instant shell
        const fallback = page.locator(
          '[data-testid="ungenerated-params-fallback"]'
        )
        await fallback.waitFor({ state: 'visible' })

        // The resolved param value must not be present in the shell
        const paramValue = page.locator(
          '[data-testid="ungenerated-param-value"]'
        )
        expect(await paramValue.count()).toBe(0)
      })

      // After the instant scope exits, the param value streams in normally
      const paramValue = page.locator('[data-testid="ungenerated-param-value"]')
      await paramValue.waitFor({ state: 'visible' })
      expect(await paramValue.textContent()).toContain('slug: anything')
    })

    it('during page load', async () => {
      const page = await openPage(next, '/')

      await instant(page, async () => {
        await page.click('#plain-link-to-ungenerated-params')

        // Static page title is visible
        const title = page.locator('[data-testid="ungenerated-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator(
          '[data-testid="ungenerated-params-fallback"]'
        )
        await fallback.waitFor({ state: 'visible' })

        // The resolved param value must not be present in the shell
        const paramValue = page.locator(
          '[data-testid="ungenerated-param-value"]'
        )
        expect(await paramValue.count()).toBe(0)
      })

      // After exiting instant scope, the param value streams in
      const paramValue = page.locator('[data-testid="ungenerated-param-value"]')
      await paramValue.waitFor({ state: 'visible', timeout: 10000 })
      expect(await paramValue.textContent()).toContain('slug: anything')
    })

    // A hover/intent prefetch must not cache resolved runtime data that then
    // leaks into the shell once the instant lock is acquired.
    it('does not leak runtime data from a hover prefetch', async () => {
      const page = await openPage(next, '/')

      // Hover over the link to trigger an intent prefetch, then wait for it.
      await page.hover('#link-to-ungenerated-params')
      await page.waitForTimeout(3000)

      await instant(page, async () => {
        await page.click('#link-to-ungenerated-params')

        // Static page title is visible
        const title = page.locator('[data-testid="ungenerated-params-title"]')
        await title.waitFor({ state: 'visible' })

        // Suspense fallback is visible
        const fallback = page.locator(
          '[data-testid="ungenerated-params-fallback"]'
        )
        await fallback.waitFor({ state: 'visible' })

        // Param value is NOT in the shell, even though a hover prefetch ran
        // before the instant lock was acquired
        const paramValue = page.locator(
          '[data-testid="ungenerated-param-value"]'
        )
        expect(await paramValue.count()).toBe(0)
      })

      // After exiting instant scope, the param value streams in
      const paramValue = page.locator('[data-testid="ungenerated-param-value"]')
      await paramValue.waitFor({ state: 'visible' })
      expect(await paramValue.textContent()).toContain('slug: anything')
    })
  })

  it('does include dynamic route params in the instant shell when runtime prefetching is enabled', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.click('#link-to-ungenerated-params-runtime')

      // The param value IS in the shell because the route opts into runtime
      // prefetching, so the prefetch resolves `slug` rather than returning
      // the generic fallback.
      const paramValue = page.locator(
        '[data-testid="ungenerated-param-runtime-value"]'
      )
      await paramValue.waitFor({ state: 'visible' })
      expect(await paramValue.textContent()).toContain('slug: anything')

      // Suspense fallback is NOT visible
      const fallback = page.locator(
        '[data-testid="ungenerated-params-runtime-fallback"]'
      )
      expect(await fallback.count()).toBe(0)
    })
  })

  // Two routes mix a `generateStaticParams`-covered param (`lang`) with an
  // uncovered one (`slug`); they differ in prefetch capability, which is what
  // each test exercises.
  //
  // `mixed-params` does NOT opt into runtime prefetching, so a normal (no
  // `prefetch` prop) navigation carries only the covered `lang` in the static
  // shell. Inside the instant scope `lang` is shown while the uncovered `slug`
  // and the request-time `connection()` sibling both stay deferred behind their
  // Suspense fallbacks. Because the route can never runtime-prefetch, `slug` is
  // deferred here.
  it('shows only the static param in the instant shell on a normal navigation to a mixed route', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.click('#link-to-mixed-params')

      // The covered `lang` comes from the static shell.
      const lang = page.locator('[data-testid="mixed-lang"]')
      await lang.waitFor({ state: 'visible' })
      expect(await lang.textContent()).toContain('lang: en')

      // The uncovered `slug` is a fallback param and there is no runtime
      // prefetch, so it stays on its Suspense fallback and its value is absent.
      await page
        .locator('[data-testid="mixed-slug-fallback"]')
        .waitFor({ state: 'visible' })
      expect(
        await page.locator('[data-testid="mixed-slug-value"]').count()
      ).toBe(0)

      // The request-time `connection()` sibling likewise stays on its fallback
      // and must not leak into the instant scope.
      await page
        .locator('[data-testid="mixed-dynamic-fallback"]')
        .waitFor({ state: 'visible' })
      expect(
        await page.locator('[data-testid="mixed-dynamic-value"]').count()
      ).toBe(0)
    })

    // After the lock releases, the uncovered `slug` and the request-time
    // content stream in.
    const slug = page.locator('[data-testid="mixed-slug-value"]')
    await slug.waitFor({ state: 'visible' })
    expect(await slug.textContent()).toContain('slug: anything')
    await page
      .locator('[data-testid="mixed-dynamic-value"]')
      .waitFor({ state: 'visible' })
  })

  // With `prefetch` on the link, the runtime prefetch ('2') resolves ALL
  // params, so inside the instant scope both `lang` (static shell) and `slug`
  // (runtime prefetch) are shown, while the genuinely request-time
  // `connection()` sibling stays deferred until the lock releases.
  it('resolves the covered param from the static shell and the uncovered param from the runtime prefetch in a mixed route', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.click('#link-to-mixed-params-runtime')

      // The generateStaticParams-covered `lang` comes from the static shell.
      const lang = page.locator('[data-testid="mixed-lang"]')
      await lang.waitFor({ state: 'visible' })
      expect(await lang.textContent()).toContain('lang: en')

      // The uncovered `slug` is resolved by the runtime prefetch and surfaces
      // inside the instant scope.
      const slug = page.locator('[data-testid="mixed-slug-value"]')
      await slug.waitFor({ state: 'visible' })
      expect(await slug.textContent()).toContain('slug: anything')

      // The request-time dynamic sibling stays on its fallback under the lock.
      await page
        .locator('[data-testid="mixed-dynamic-fallback"]')
        .waitFor({ state: 'visible' })
      expect(
        await page.locator('[data-testid="mixed-dynamic-value"]').count()
      ).toBe(0)
    })

    // After the lock releases, the request-time content streams in while both
    // params remain visible.
    await page
      .locator('[data-testid="mixed-dynamic-value"]')
      .waitFor({ state: 'visible' })
    expect(
      await page.locator('[data-testid="mixed-lang"]').textContent()
    ).toContain('lang: en')
    expect(
      await page.locator('[data-testid="mixed-slug-value"]').textContent()
    ).toContain('slug: anything')
  })

  it('subsequent navigations after instant scope are not locked', async () => {
    const page = await openPage(next, '/')

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

  it('throws descriptive error on fresh page without baseURL', async () => {
    const page = await openPage(next, '/')
    const freshPage = await page.context().newPage()
    try {
      let caughtError: Error | undefined
      try {
        await instant(freshPage, async () => {})
      } catch (e) {
        caughtError = e as Error
      }
      // Snapshot the error message
      expect(caughtError!.message).toMatchInlineSnapshot(`
        "Could not infer the base URL of the application.

        instant() needs to know the base URL so it can configure the
        browser before the first page load. If the page is already
        loaded, the base URL is detected automatically.
        Otherwise, you can fix this in one of two ways:

        1. Pass a baseURL option:

          await instant(page, async () => {
            await page.goto('http://localhost:3000')
            // ...
          }, { baseURL: 'http://localhost:3000' })

          Tip: If you use baseURL in your Playwright config, you can
          get it from the test fixture:

            test('my test', async ({ page, baseURL }) => {
              await instant(page, async () => {
                // ...
              }, { baseURL })
            })

        2. Navigate to a page before calling instant():

          await page.goto('http://localhost:3000')
          await instant(page, async () => {
            // ...
          })"
      `)

      // Verify the stack trace points at the caller, not at the
      // internals of the instant() helper.
      const firstFrame = caughtError!
        .stack!.split('\n')
        .find((line) => line.trimStart().startsWith('at '))
      expect(firstFrame).not.toContain('resolveURL')
      expect(firstFrame).not.toContain('at instant ')
    } finally {
      await freshPage.close()
    }
  })

  it('sets cookie before first navigation when using baseURL', async () => {
    const page = await openPage(next, '/')
    const freshPage = await page.context().newPage()
    try {
      await instant(
        freshPage,
        async () => {
          // Navigate to a page for the first time within the instant scope.
          // The cookie was set via addCookies before this navigation, so
          // the server sees it on the initial request and blocks dynamic data.
          await freshPage.goto(next.url + '/target-page')

          // The loading shell appears immediately
          const loadingShell = freshPage.locator(
            '[data-testid="loading-shell"]'
          )
          await loadingShell.waitFor({ state: 'visible' })
          expect(await loadingShell.textContent()).toContain(
            'Loading target page...'
          )

          // Dynamic content has not streamed in yet
          const dynamicContent = freshPage.locator(
            '[data-testid="dynamic-content"]'
          )
          expect(await dynamicContent.count()).toBe(0)
        },
        { baseURL: next.url }
      )

      // After exiting the instant scope, dynamic content streams in
      const dynamicContent = freshPage.locator(
        '[data-testid="dynamic-content"]'
      )
      await dynamicContent.waitFor({ state: 'visible' })
      expect(await dynamicContent.textContent()).toContain(
        'Dynamic content loaded'
      )
    } finally {
      await freshPage.close()
    }
  })

  it('clears cookie after instant scope exits', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.reload()
      const homeTitle = page.locator('[data-testid="home-title"]')
      await homeTitle.waitFor({ state: 'visible' })
    })

    // The instant cookie should be cleaned up
    const cookies = await page.context().cookies()
    const instantCookie = cookies.find(
      (c) => c.name === 'next-instant-navigation-testing'
    )
    expect(instantCookie).toBeUndefined()
  })

  it('blocks out-of-band client fetch during instant scope (SPA)', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.click('#link-to-client-fetch')

      // The page title appears (it's a client component, rendered immediately)
      const title = page.locator('[data-testid="client-fetch-title"]')
      await title.waitFor({ state: 'visible' })

      // The fetch to /api/data is blocked, so the loading state persists
      const loading = page.locator('[data-testid="fetched-data-loading"]')
      await loading.waitFor({ state: 'visible' })

      // The fetched data has NOT arrived
      const fetchedData = page.locator('[data-testid="fetched-data"]')
      expect(await fetchedData.count()).toBe(0)
    })

    // After exiting the instant scope, the fetch completes
    const fetchedData = page.locator('[data-testid="fetched-data"]')
    await fetchedData.waitFor({ state: 'visible' })
    expect(await fetchedData.textContent()).toContain('api response')
  })

  it('blocks out-of-band client fetch during instant scope (MPA)', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.click('#plain-link-to-client-fetch')

      // The page title appears
      const title = page.locator('[data-testid="client-fetch-title"]')
      await title.waitFor({ state: 'visible' })

      // The fetch to /api/data is blocked, so the loading state persists
      const loading = page.locator('[data-testid="fetched-data-loading"]')
      await loading.waitFor({ state: 'visible' })

      // The fetched data has NOT arrived
      const fetchedData = page.locator('[data-testid="fetched-data"]')
      expect(await fetchedData.count()).toBe(0)
    })

    // After exiting the instant scope, the fetch completes
    const fetchedData = page.locator('[data-testid="fetched-data"]')
    await fetchedData.waitFor({ state: 'visible' })
    expect(await fetchedData.textContent()).toContain('api response')
  })

  it('clears cookie even when callback throws', async () => {
    const page = await openPage(next, '/')

    await expect(
      instant(page, async () => {
        throw new Error('test error')
      })
    ).rejects.toThrow('test error')

    // The instant cookie should still be cleaned up
    const cookies = await page.context().cookies()
    const instantCookie = cookies.find(
      (c) => c.name === 'next-instant-navigation-testing'
    )
    expect(instantCookie).toBeUndefined()
  })

  // A page that reads a dynamic value (e.g. `await cookies()`) at the root with
  // no Suspense boundary above it produces an empty static shell. Serving that
  // shell under the instant lock would be a blank document with no way to
  // release the lock, so every reload would render the same empty shell and
  // leave the user stuck. The framework breaks that loop: it surfaces the error
  // and clears the instant cookie so the next reload renders the route
  // normally. We assert the user-facing outcome, not transport details (status
  // code, Set-Cookie) which legitimately differ across dev, `next start`, and
  // deploy.
  it('recovers on reload for a blocking route under the instant lock', async () => {
    const browser = await next.browser('/root-blocking-page', {
      beforePageLoad(p: Playwright.Page) {
        const { hostname } = new URL(next.url)
        p.context().addCookies([
          {
            name: 'next-instant-navigation-testing',
            value: '[0]',
            domain: hostname,
            path: '/',
          },
        ])
      },
    })

    // In development the empty shell surfaces as an error overlay so the
    // developer sees why the route is blocking.
    if (isNextDev) {
      await expect(browser).toDisplayRedbox(`
       {
         "code": "E1387",
         "description": "The Navigation Inspector was active, but you attempted to load a blocking route. Reload the page to reset the inspector.

       To identify why this route is blocking, refer to the Instant Navigation docs: https://preview.nextjs.org/docs/app/guides/instant-navigation",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    }

    // The empty shell can render nothing useful, but the instant cookie is
    // cleared, so reloading renders the route normally instead of the blank
    // shell.
    await browser.refresh()

    const content = await browser
      .elementByCss('[data-testid="root-blocking-content"]')
      .text()
    expect(content).toContain('testCookie:')
  })
})

describe('instant-navigation-testing-api - root params', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'root-params'),
  })

  it('includes root param in instant shell', async () => {
    const page = await openPage(next, '/en')

    const langValue = page.locator('[data-testid="lang-value"]')
    await langValue.waitFor({ state: 'visible' })
    expect(await langValue.textContent()).toContain('lang: en')

    await instant(page, async () => {
      await page.reload()

      // The root param value is still visible (it's statically known)
      await langValue.waitFor({ state: 'visible' })
      expect(await langValue.textContent()).toContain('lang: en')
    })
  })
})

describe('instant-navigation-testing-api - partial prefetching (App Shells)', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'partial-prefetch'),
    // Skew protection (deployment-id asset versioning) is orthogonal to the
    // shell-restriction behavior under test. Disable it so the suite exercises
    // only the navigation-lock behavior.
    disableAutoSkewProtection: true,
  })

  // Under Partial Prefetching with App Shells, an auto (partial) prefetch only
  // warms the shell — the concrete-param entry is not speculatively
  // prefetched. The testing lock simulates that warm cache: a navigation may
  // only match the shell entry, never an entry that varies on concrete route
  // params, even if such an entry happens to be warm in the cache (here, from a
  // sibling prefetch={true} link). Without the restriction, the navigation
  // would match the warm `slug: hello` entry and show it instantly.
  it('restricts navigation to the shell even when a concrete-param entry is warm', async () => {
    const page = await openPage(next, '/')

    // Warm both entries for /dynamic-params/hello:
    //  - the prefetch={true} sibling link does a speculative (whole-route)
    //    prefetch, warming the concrete slug=hello segment entry, and
    //  - the default link does a partial prefetch, warming the shell entry
    //    (params -> Fallback) that the restricted navigation should render.
    await page.hover('#full-link')
    await page.hover('#partial-link')
    await page.waitForTimeout(3000)

    await instant(page, async () => {
      // Navigate via the default (partial) link. Even though the concrete
      // slug=hello entry is warm, the lock restricts the read to the shell.
      await page.click('#partial-link')

      // A shell boundary is shown — either the route-level loading.tsx or the
      // page's inner Suspense fallback — proving the navigation rendered the
      // shell rather than the warm concrete entry.
      const shell = page.locator(
        '[data-testid="route-loading"], [data-testid="params-fallback"]'
      )
      await shell.first().waitFor({ state: 'visible' })

      // The concrete param value is NOT matched.
      const paramValue = page.locator('[data-testid="param-value"]')
      expect(await paramValue.count()).toBe(0)
    })

    // After the instant scope exits, the concrete value streams in normally.
    const paramValue = page.locator('[data-testid="param-value"]')
    await paramValue.waitFor({ state: 'visible' })
    expect(await paramValue.textContent()).toContain('slug: hello')
  })

  // A prefetch={true} link triggers a speculative (whole-route) prefetch, so
  // the concrete-param entry IS prefetched. In that case the lock must NOT
  // restrict to the shell — the navigation is allowed to match the concrete
  // entry, since that's what a warm cache would actually contain.
  it('allows matching concrete params when the link uses prefetch={true}', async () => {
    const page = await openPage(next, '/')

    await instant(page, async () => {
      await page.click('#full-link')

      // The concrete param value is matched and shown instantly.
      const paramValue = page.locator('[data-testid="param-value"]')
      await paramValue.waitFor({ state: 'visible' })
      expect(await paramValue.textContent()).toContain('slug: hello')

      // The Suspense fallback (shell) is NOT shown.
      const fallback = page.locator('[data-testid="params-fallback"]')
      expect(await fallback.count()).toBe(0)
    })
  })
})

// A route with no static shell — `cookies()` read outside any <Suspense>, no
// `instant = false` — is a hard `next build` error (it can't be prerendered),
// so it can't live in a fixture that gets production-built. The Instant
// Navigation behavior it exercises (the destination must not commit under the
// lock) is a dev-time concern, so this suite uses a dedicated fixture and runs
// in dev only; `next start`/deploy register a single placeholder so the build
// is never attempted.
describe('instant-navigation-testing-api - blocking routes (dev only)', () => {
  if (!isNextDev) {
    it('skips blocking route tests outside dev (route cannot be production-built)', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'blocking'),
    skipDeployment: true,
  })

  // The cookie value must not commit while the instant lock is held; it only
  // streams in after the lock releases.
  it('does not include blocking cookies read outside a Suspense in the instant shell', async () => {
    const page = await openPage(next, '/', {
      cookies: [{ name: 'testCookie', value: 'hello' }],
    })
    await page
      .locator('[data-testid="home-title"]')
      .waitFor({ state: 'visible' })

    await instant(page, async () => {
      await page.click('#link-to-blocking-cookies')

      const cookieValue = page.locator('[data-testid="blocking-cookie-value"]')
      // Poll past the point where a leak previously committed (~10s), breaking
      // early so a regression fails fast.
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(1000)
        if (await cookieValue.count()) break
      }
      expect(await cookieValue.count()).toBe(0)
    })

    // After exiting the instant scope, the cookie value streams in.
    const cookieValue = page.locator('[data-testid="blocking-cookie-value"]')
    await cookieValue.waitFor({ state: 'visible' })
    expect(await cookieValue.textContent()).toContain('testCookie: hello')
  })
})

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const enableCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('cache-indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('is none on initial load', async () => {
    const browser = await next.browser('/')

    const badge = await browser.elementByCss('[data-next-badge]')
    const cacheStatus = await badge.getAttribute('data-status')

    // If compilation is still in progress (e.g. on a slow CI machine), the
    // cache status might briefly be "compiling" before becoming "none", so we
    // allow both here, before eventually asserting that it becomes "none".
    expect(cacheStatus).toBeOneOf(['none', 'compiling'])
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const cacheStatus = await badge.getAttribute('data-status')
      expect(cacheStatus).toBe('none')
    })
  })

  if (enableCacheComponents) {
    // TODO: Replace this with tests that assert a cache miss indicator is shown
    // instead when this is implemented.
    it.skip('renders the cache warming indicator when navigating to a page that needs to warm the cache', async () => {
      const browser = await next.browser('/')

      // navigate to the navigation page
      const link = await browser.waitForElementByCss('a[href="/navigation"]')
      await link.click()

      await retry(async () => {
        const badge = await browser.elementByCss('[data-next-badge]')
        const cacheStatus = await badge.getAttribute('data-status')
        expect(cacheStatus).toBe('prerendering')
      })

      await retry(async () => {
        const text = await browser.elementByCss('#navigation-page').text()
        expect(text).toContain('Hello navigation page!')
      })

      const badge = await browser.elementByCss('[data-next-badge]')
      const status = await badge.getAttribute('data-status')
      expect(status).toBe('none')
    })

    it('shows cache-bypassing badge when cache is disabled', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for the badge to appear and show cache-bypassing status
      await retry(async () => {
        const badge = await browser.elementByCss('[data-next-badge]')
        const cacheBypassingAttr = await badge.getAttribute(
          'data-cache-bypassing'
        )
        expect(cacheBypassingAttr).toBe('true')
      })

      // Verify the cache bypass badge is visible
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Verify the badge shows "Cache disabled" text
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      const badgeText = await badgeButton.text()
      expect(badgeText).toBe('Cache disabled')
    })

    it('shows cache-bypassing badge when draft mode is enabled', async () => {
      const browser = await next.browser('/api/draft/enable')

      // Wait for the badge to appear and show cache-bypassing status
      await retry(async () => {
        const badge = await browser.elementByCss('[data-next-badge]')
        const cacheBypassingAttr = await badge.getAttribute(
          'data-cache-bypassing'
        )
        expect(cacheBypassingAttr).toBe('true')
      })

      // Verify the cache bypass badge is visible
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Verify the badge shows "Cache disabled" text
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      const badgeText = await badgeButton.text()
      expect(badgeText).toBe('Cache disabled')
    })

    it('persists cache-bypassing badge after navigation when cache is disabled', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for initial cache-bypassing badge
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Navigate to another page
      const link = await browser.waitForElementByCss('a[href="/navigation"]')
      await link.click()

      // Wait for navigation to complete
      await retry(async () => {
        const text = await browser.elementByCss('#navigation-page').text()
        expect(text).toContain('Hello navigation page!')
      })

      // Verify cache-bypassing badge persists after navigation
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Verify the badge still shows "Cache disabled" text
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      const badgeText = await badgeButton.text()
      expect(badgeText).toBe('Cache disabled')
    })

    it('opens devtools menu when clicking cache-bypassing badge', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for the cache-bypassing badge to appear
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Click the cache bypass badge
      const badgeButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-open]'
      )
      await badgeButton.click()

      // Verify devtools menu opens
      await retry(async () => {
        const hasMenu = await browser.hasElementByCss('#nextjs-dev-tools-menu')
        expect(hasMenu).toBe(true)
      })
    })

    it('opens cache-disabled info panel from the devtools menu', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Open the devtools menu via the cache-bypass badge (the regular
      // indicator is hidden when caches are bypassed).
      await browser
        .elementByCss('[data-cache-bypass-badge] [data-issues-open]')
        .click()

      await retry(async () => {
        const hasMenu = await browser.hasElementByCss('#nextjs-dev-tools-menu')
        expect(hasMenu).toBe(true)
      })

      await browser.elementByCss('[data-cache-disabled]').click()

      await retry(async () => {
        const article = await browser.elementByCss('.dev-tools-info-article')
        expect(await article.text()).toMatchInlineSnapshot(`
         "While loading this page, all caches were bypassed.

         This is the case when the cache was disabled in the browser's devtools, the page was hard-reloaded, or draft mode is enabled.

         As a result, the loading experience might not be the same as in production. React's DevTools will also not accurately show information about what would normally suspend in the page, and Next.js cannot validate whether a navigation to this page would be instant or blocking."
        `)
      })
    })

    it('can dismiss cache-bypassing badge', async () => {
      const browser = await next.browser('/', {
        extraHTTPHeaders: { 'cache-control': 'no-cache' },
      })

      // Wait for the cache-bypassing badge to appear
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(true)
      })

      // Click the collapse button
      const collapseButton = await browser.elementByCss(
        '[data-cache-bypass-badge] [data-issues-collapse]'
      )
      await collapseButton.click()

      // Verify badge is dismissed
      await retry(async () => {
        const hasCacheBypassBadge = await browser.hasElementByCss(
          '[data-cache-bypass-badge]'
        )
        expect(hasCacheBypassBadge).toBe(false)
      })
    })
  }
})

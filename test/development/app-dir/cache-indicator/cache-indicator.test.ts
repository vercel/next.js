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
    expect(cacheStatus).toBe('none')
  })

  if (enableCacheComponents) {
    it('renders the cache warming indicator when navigating to a page that needs to warm the cache', async () => {
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

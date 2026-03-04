import { nextTestSetup } from 'e2e-utils'
import {
  retry,
  waitForDevToolsIndicator,
  toggleDevToolsIndicatorPopover,
} from 'next-test-utils'

describe('instant-nav-panel', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function clearInstantModeCookie(browser: any) {
    await browser.eval(() => {
      document.cookie =
        'next-instant-navigation-testing=; path=/; max-age=0'
    })
  }

  async function clickInstantNavMenuItem(browser: any) {
    await browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      portal?.shadowRoot?.querySelector('[data-instant-nav]')?.click()
    })
  }

  async function getBadgeStatus(browser: any): Promise<string> {
    return browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      return (
        portal?.shadowRoot
          ?.querySelector('[data-next-badge]')
          ?.getAttribute('data-status') || ''
      )
    })
  }

  async function getPanelText(browser: any): Promise<string> {
    return browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      const panel = portal?.shadowRoot?.querySelector(
        '.instant-nav-panel'
      )
      return panel?.innerText || ''
    })
  }

  async function hasPanelOpen(browser: any): Promise<boolean> {
    return browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      return !!portal?.shadowRoot?.querySelector('.instant-nav-panel')
    })
  }

  async function closePanelViaHeader(browser: any) {
    await browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      portal?.shadowRoot
        ?.querySelector('#_next-devtools-panel-close')
        ?.click()
    })
  }

  async function openInstantNavPanel(browser: any) {
    await waitForDevToolsIndicator(browser)
    await toggleDevToolsIndicatorPopover(browser)
    await clickInstantNavMenuItem(browser)
  }

  it('should open panel in waiting state and set cookie', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Wait for initial compilation to settle
    await retry(async () => {
      const status = await getBadgeStatus(browser)
      expect(status).toBe('none')
    })

    await openInstantNavPanel(browser)

    // Panel should show waiting state
    await retry(async () => {
      const text = await getPanelText(browser)
      expect(text).toContain('Navigate to a page')
    })

    // Badge should show instant status
    await retry(async () => {
      const status = await getBadgeStatus(browser)
      expect(status).toBe('instant')
    })

    // Cookie should be set
    const cookie = await browser.eval(() => document.cookie)
    expect(cookie).toContain('next-instant-navigation-testing=1')

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show client nav details after SPA navigation', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Wait for panel to be open
    await retry(async () => {
      expect(await hasPanelOpen(browser)).toBe(true)
    })

    // Navigate to target page via SPA
    await browser.elementByCss('#link-to-target').click()

    // Panel should transition to client-nav state
    await retry(async () => {
      const text = await getPanelText(browser)
      expect(text).toContain('Client nav')
      expect(text).toContain('From:')
      expect(text).toContain('To:')
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show loading skeleton during SPA navigation when panel is open', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Wait for instant mode to be active
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const attr = await badge.getAttribute('data-cache-only')
      expect(attr).toBe('true')
    })

    // Navigate to target page via SPA
    await browser.elementByCss('#link-to-target').click()

    // The comments skeleton should be visible (dynamic content is locked)
    await retry(async () => {
      const skeleton = await browser.hasElementByCss(
        '[data-testid="comments-skeleton"]'
      )
      expect(skeleton).toBe(true)
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should turn off instant mode when clicking the badge status indicator', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Verify it's on
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const attr = await badge.getAttribute('data-cache-only')
      expect(attr).toBe('true')
    })

    // Click the "Instant..." status indicator to unlock
    await browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      portal?.shadowRoot?.querySelector('[data-indicator-status]')?.click()
    })

    // After reload, instant mode should be off
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const attr = await badge.getAttribute('data-cache-only')
      expect(attr).toBe('false')
    })
  })

  it('should clear cookie when closing panel via X button', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Verify cookie is set
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).toContain('next-instant-navigation-testing=')
    })

    // Close panel via X button
    await closePanelViaHeader(browser)

    // Cookie should be cleared
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).not.toContain('next-instant-navigation-testing=')
    })
  })
})

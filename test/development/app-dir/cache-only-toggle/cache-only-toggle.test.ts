import { nextTestSetup } from 'e2e-utils'
import {
  retry,
  waitForDevToolsIndicator,
  toggleDevToolsIndicatorPopover,
} from 'next-test-utils'

describe('instant-mode-toggle', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function clearInstantModeCookie(browser: any) {
    await browser.eval(() => {
      document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'
    })
  }

  async function clickInstantModeMenuItem(browser: any) {
    await browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      portal?.shadowRoot?.querySelector('[data-cache-only]')?.click()
    })
  }

  async function getInstantModeMenuValue(browser: any): Promise<string> {
    return browser.eval(() => {
      const portal = [].slice
        .call(document.querySelectorAll('nextjs-portal'))
        .find((p: any) =>
          p.shadowRoot.querySelector('[data-nextjs-toast]')
        ) as any
      return (
        portal?.shadowRoot
          ?.querySelector('[data-cache-only]')
          ?.innerText.split('\n')
          .pop() || ''
      )
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

  it('should show "instant" status after toggling on, not stuck on "compiling"', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Wait for initial compilation to settle — the badge status should
    // become "none" once compilation is done and no transient status is active
    await retry(async () => {
      const status = await getBadgeStatus(browser)
      expect(status).toBe('none')
    })

    // Toggle instant mode on
    await waitForDevToolsIndicator(browser)
    await toggleDevToolsIndicatorPopover(browser)
    await clickInstantModeMenuItem(browser)

    // The badge status should settle to "instant", not stay on "compiling"
    await retry(async () => {
      const status = await getBadgeStatus(browser)
      expect(status).toBe('instant')
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show "Instant mode" menu item and toggle it on', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)

    await waitForDevToolsIndicator(browser)
    await toggleDevToolsIndicatorPopover(browser)

    // Verify the "Instant mode" menu item shows "Off"
    await retry(async () => {
      const value = await getInstantModeMenuValue(browser)
      expect(value).toBe('Off')
    })

    // Click to toggle on — this also closes the menu
    await clickInstantModeMenuItem(browser)

    // Verify the badge appears with data-cache-only="true"
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const attr = await badge.getAttribute('data-cache-only')
      expect(attr).toBe('true')
    })

    // Verify the status indicator shows "Instant..."
    await retry(async () => {
      const hasIndicator = await browser.hasElementByCss(
        '[data-indicator-status]'
      )
      expect(hasIndicator).toBe(true)
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show loading skeleton during SPA navigation when instant mode is on', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Toggle instant mode on
    await toggleDevToolsIndicatorPopover(browser)
    await clickInstantModeMenuItem(browser)

    // Wait for instant mode to be active
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const attr = await badge.getAttribute('data-cache-only')
      expect(attr).toBe('true')
    })

    // Navigate to target page via SPA
    await browser.elementByCss('#link-to-target').click()

    // The comments skeleton should be visible (dynamic content is locked)
    // while static content (heading, paragraph) is already rendered
    await retry(async () => {
      const skeleton = await browser.hasElementByCss(
        '[data-testid="comments-skeleton"]'
      )
      expect(skeleton).toBe(true)
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should turn off instant mode when clicking the badge', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Toggle instant mode on via menu
    await toggleDevToolsIndicatorPopover(browser)
    await clickInstantModeMenuItem(browser)

    // Verify it's on
    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const attr = await badge.getAttribute('data-cache-only')
      expect(attr).toBe('true')
    })

    // Click the "Instant..." status indicator to unlock — this clears the cookie and reloads
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
})

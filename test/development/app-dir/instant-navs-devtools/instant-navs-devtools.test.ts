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
      document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'
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
      const panel = portal?.shadowRoot?.querySelector('.instant-nav-panel')
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
      portal?.shadowRoot?.querySelector('#_next-devtools-panel-close')?.click()
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

    // Panel should show waiting state with Page load and Client navigation sections
    await retry(async () => {
      const text = await getPanelText(browser)
      expect(text).toContain('Page load')
      expect(text).toContain('Client navigation')
    })

    // Cookie should be set to activate navigation lock
    const cookie = await browser.eval(() => document.cookie)
    expect(cookie).toContain('next-instant-navigation-testing=1')

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show client nav state after SPA navigation', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Wait for initial compilation to settle (tsconfig creation triggers Fast Refresh)
    await retry(async () => {
      const status = await getBadgeStatus(browser)
      expect(status).toBe('none')
    })

    await openInstantNavPanel(browser)

    // Wait for panel to be open
    await retry(async () => {
      expect(await hasPanelOpen(browser)).toBe(true)
    })

    // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })

    // Panel should transition to client-nav state
    await retry(async () => {
      const text = await getPanelText(browser)
      expect(text).toContain('Client navigation')
      expect(text).toContain('prefetched UI')
      expect(text).toContain('Continue rendering')
    })

    // Clean up
    await clearInstantModeCookie(browser)
  })

  it('should show loading skeleton during SPA navigation when panel is open', async () => {
    const browser = await next.browser('/')
    await clearInstantModeCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    await openInstantNavPanel(browser)

    // Wait for panel to be open (instant mode is active)
    await retry(async () => {
      expect(await hasPanelOpen(browser)).toBe(true)
    })

    // Navigate to target page via SPA (use eval to bypass overlay pointer interception)
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })

    // The data fetching skeleton should be visible (dynamic content is locked)
    await retry(async () => {
      const skeleton = await browser.hasElementByCss(
        '[data-testid="dynamic-skeleton"]'
      )
      expect(skeleton).toBe(true)
    })

    // Clean up
    await clearInstantModeCookie(browser)
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

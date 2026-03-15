import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('instant-devtools-prod', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const COOKIE_NAME = 'next-instant-navigation-testing'

  async function clearCookie(browser: Playwright) {
    await browser.eval(() => {
      document.cookie = 'next-instant-navigation-testing=; path=/; max-age=0'
    })
  }

  // The widget renders inside a shadow root, so we query via eval.
  async function getToggleText(browser: Playwright): Promise<string> {
    return browser.eval(() => {
      const host = document.querySelector('next-instant-devtools')
      return host?.shadowRoot?.textContent ?? ''
    })
  }

  function clickButton(browser: Playwright, label: string) {
    return browser.eval((buttonLabel: string) => {
      const host = document.querySelector('next-instant-devtools')
      const buttons = host?.shadowRoot?.querySelectorAll('button') ?? []
      for (const btn of buttons) {
        if (btn.textContent?.trim() === buttonLabel) {
          btn.click()
          return
        }
      }
    }, label)
  }

  // The panel starts minimized. Click the indicator to expand it.
  async function expandPanel(browser: Playwright) {
    await retry(async () => {
      await browser.eval(() => {
        const host = document.querySelector('next-instant-devtools')
        const btn = host?.shadowRoot?.querySelector(
          'button[aria-label="Open Instant Navigation Inspector"]'
        ) as HTMLButtonElement | null
        btn?.click()
      })
      const text = await getToggleText(browser)
      expect(text).toContain('Instant Navigation Inspector')
    })
  }

  it('should auto-render the instant devtools toggle', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Page load')
      expect(text).toContain('Client navigation')
    })
  })

  it('should show client nav waiting state after clicking Start', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Start')
    })
    await clickButton(browser, 'Start')

    // Cookie should be set
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).toContain(COOKIE_NAME)
    })

    // Should show waiting message
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Click any link')
    })

    await clearCookie(browser)
  })

  it('should capture navigation and show Continue rendering', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await clickButton(browser, 'Start')

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Click any link')
    })

    // Navigate via link click
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })

    // Should show captured state with Continue rendering button.
    // In production, the navigation may be captured as SPA ("prefetched UI")
    // or fall back to MPA ("static UI") depending on prefetch timing.
    // Both are correct — the lock works in either case.
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Continue rendering')
    })

    await clearCookie(browser)
  })

  it('should unlock and stream dynamic content after clicking Continue rendering', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await clickButton(browser, 'Start')

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Click any link')
    })
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })

    // Wait for captured state
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Continue rendering')
    })

    await clickButton(browser, 'Continue rendering')

    // Dynamic content should stream in
    await retry(async () => {
      const text = await browser
        .elementByCss('[data-testid="dynamic-content"]')
        .text()
      expect(text).toContain('Dynamic content loaded')
    })

    // Cookie should be cleared
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).not.toContain(COOKIE_NAME)
    })
  })

  it('should capture MPA page load after clicking Reload', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    // Navigate to target page first (so Reload captures it)
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })
    await retry(async () => {
      const text = await browser
        .elementByCss('[data-testid="dynamic-content"]')
        .text()
      expect(text).toContain('Dynamic content loaded')
    })

    await clickButton(browser, 'Reload')

    // After reload the panel re-mounts minimized, expand it again
    await expandPanel(browser)

    // After reload, should show MPA captured state
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('static UI')
      expect(text).toContain('Continue rendering')
    })

    await clearCookie(browser)
  })
})

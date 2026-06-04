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

  // The minimized indicator expands via pointer events (it doubles as the drag
  // handle), which are awkward to synthesize reliably. The widget persists its
  // open/closed state in localStorage, so we set that and reload to mount it
  // already expanded. No-op if it is already open.
  async function expandPanel(browser: Playwright) {
    const alreadyOpen = (await getToggleText(browser)).includes(
      'Navigation Inspector'
    )
    if (alreadyOpen) return
    await browser.eval(() => {
      try {
        localStorage.setItem('__next_instant_devtools_open', '1')
      } catch {}
    })
    await browser.refresh()
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Navigation Inspector')
    })
  }

  it('should auto-render the instant devtools toggle', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    // Idle state: the inspector title and the Start Capturing control.
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Navigation Inspector')
      expect(text).toContain('Start Capturing')
    })
  })

  it('should show the waiting state after clicking Start Capturing', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Start Capturing')
    })
    await clickButton(browser, 'Start Capturing')

    // Cookie should be set
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).toContain(COOKIE_NAME)
    })

    // Should show the waiting message
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Click any link')
    })

    await clearCookie(browser)
  })

  it('should capture navigation and show Continue Rendering', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await clickButton(browser, 'Start Capturing')

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Click any link')
    })

    // Navigate via link click
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })

    // Should show the captured state with the Continue Rendering control.
    // In production the navigation may be captured as SPA ("prefetched UI")
    // or fall back to MPA ("prerendered UI") depending on prefetch timing.
    // Both are correct: the lock works in either case.
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Continue Rendering')
    })

    await clearCookie(browser)
  })

  it('should stream dynamic content after clicking Continue Rendering', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')
    await expandPanel(browser)

    await clickButton(browser, 'Start Capturing')

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Click any link')
    })
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })

    // Wait for the captured state
    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Continue Rendering')
    })

    await clickButton(browser, 'Continue Rendering')

    // Releasing the lock triggers the soft refresh that streams dynamic data.
    await retry(async () => {
      const text = await browser
        .elementByCss('[data-testid="dynamic-content"]')
        .text()
      expect(text).toContain('Dynamic content loaded')
    })

    await clearCookie(browser)
  })

  it('should capture an MPA page load after reloading with capture armed', async () => {
    const browser = await next.browser('/')
    await clearCookie(browser)
    await browser.waitForElementByCss('[data-testid="home-title"]')

    // Go to the dynamic target page so the captured page load has a static shell.
    await browser.eval(() => {
      document.querySelector<HTMLAnchorElement>('#link-to-target')!.click()
    })
    await retry(async () => {
      const text = await browser
        .elementByCss('[data-testid="dynamic-content"]')
        .text()
      expect(text).toContain('Dynamic content loaded')
    })

    // Arm capture, then do a full reload: the pending cookie freezes the page
    // load and it is captured as an MPA ("Page load").
    await expandPanel(browser)
    await clickButton(browser, 'Start Capturing')
    await retry(async () => {
      const cookie = await browser.eval(() => document.cookie)
      expect(cookie).toContain(COOKIE_NAME)
    })

    await browser.refresh()

    // The panel may re-mount minimized; expand it again.
    await expandPanel(browser)

    await retry(async () => {
      const text = await getToggleText(browser)
      expect(text).toContain('Page load')
      expect(text).toContain('Continue Rendering')
    })

    await clearCookie(browser)
  })
})

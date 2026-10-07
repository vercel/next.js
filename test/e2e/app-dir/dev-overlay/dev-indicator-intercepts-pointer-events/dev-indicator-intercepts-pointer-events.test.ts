import { nextTestSetup } from 'e2e-utils'
import { retry, waitForDevToolsIndicator } from 'next-test-utils'

// The viewport of a Pixel 5, as used by the report.
const MOBILE_VIEWPORT = { width: 393, height: 727 }

describe('dev-overlay - dev indicator intercepts pointer events', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (!isNextDev) {
    it('skipped in production mode', () => {})
    return
  }

  async function openMobilePage() {
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.setViewportSize(MOBILE_VIEWPORT)
      },
    })
    await waitForDevToolsIndicator(browser)
    return browser
  }

  it('owns the hit target of an app control in the bottom-left corner', async () => {
    const browser = await openMobilePage()

    const hitTarget = await browser.eval(() => {
      const rect = document
        .querySelector('#menu-button')!
        .getBoundingClientRect()
      const element = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2
      )
      return element ? element.tagName.toLowerCase() : null
    })

    // Current behavior: the dev overlay portal, and not the app's own control,
    // is the hit target at the center of the visible control. Once the overlay
    // stops capturing pointer events outside of its own visible UI, this is
    // expected to be `a` (the app's control).
    expect(hitTarget).toBe('nextjs-portal')
  })

  it('makes Playwright refuse to click an app control in the bottom-left corner', async () => {
    const browser = await openMobilePage()

    // The control itself is visible, enabled and interactive: clicking it
    // from within the page navigates.
    await browser.eval(() =>
      (document.querySelector('#menu-button') as HTMLElement).click()
    )
    await retry(async () => {
      expect(await browser.elementByCss('#menu-page').text()).toBe('menu page')
    })

    const browser2 = await openMobilePage()

    // Current behavior: a real pointer click never lands, because the dev
    // overlay portal intercepts it. Once that is fixed, this click resolves
    // instead of timing out.
    await expect(
      browser2.locator('#menu-button').click({ timeout: 5000 })
    ).rejects.toThrow(/<nextjs-portal>.*intercepts pointer events/s)
  })
})

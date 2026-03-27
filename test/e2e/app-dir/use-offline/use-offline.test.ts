import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'

describe('useOffline - retry behavior', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  // Uses Playwright's built-in network emulation, which fires the browser's
  // native offline/online events and blocks all requests at the network layer.
  async function goOffline(page: Playwright.Page) {
    await page.context().setOffline(true)
  }

  async function goOnline(page: Playwright.Page) {
    await page.context().setOffline(false)
  }

  it('retries navigation after connectivity is restored', async () => {
    let act: ReturnType<typeof createRouterAct>
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
        act = createRouterAct(p)
      },
    })

    // Verify we're on the home page
    expect(await browser.elementById('home').text()).toContain('Home')

    // Prefetch the target link
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/destination"]'
      )
      await toggle.click()
    })

    // Go offline, then click the link.
    await goOffline(page!)

    const link = await browser.elementByCss('a[href="/destination"]')
    await link.click()

    // The navigation is stuck in a pending transition — React keeps showing
    // the current page. The target content should not be visible.
    expect(await browser.hasElementByCssSelector('#destination-content')).toBe(
      false
    )
    expect(await browser.elementById('home').text()).toContain('Home')

    // Restore connectivity. The retry loop should detect this and
    // complete the navigation.
    await goOnline(page!)

    await retry(async () => {
      expect(await browser.elementById('destination-content').text()).toBe(
        'Destination page content'
      )
    })
  })
})

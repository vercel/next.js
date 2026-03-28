import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
import { retry } from 'next-test-utils'

describe('useOffline', () => {
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

    // Verify we're on the home page and online
    expect(await browser.elementById('home').text()).toContain('Home')
    expect(await browser.elementById('offline-status').text()).toBe('online')

    // Prefetch the destination link
    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/destination"]'
      )
      await toggle.click()
    })

    // Go offline, then click the link. The prefetched static shell should
    // render immediately (from the cache), but the dynamic content behind
    // the Suspense boundary won't load.
    await goOffline(page!)

    const link = await browser.elementByCss('a[href="/destination"]')
    await link.click()

    // The destination page's static shell renders from the prefetch cache.
    await retry(async () => {
      expect(await browser.elementById('destination-content').text()).toContain(
        'Destination page'
      )
    })

    // The Suspense fallback is visible and shows the offline indicator.
    expect(await browser.elementById('destination-loading').text()).toContain(
      'Waiting for data...'
    )
    // useOffline() returns true in both the layout and the Suspense fallback.
    expect(await browser.elementById('offline-status').text()).toBe('offline')
    expect(await browser.elementById('destination-loading').text()).toContain(
      'offline'
    )

    // The dynamic content hasn't loaded yet.
    expect(await browser.hasElementByCssSelector('#destination-dynamic')).toBe(
      false
    )

    // Restore connectivity. The dynamic content should stream in.
    await goOnline(page!)

    await retry(async () => {
      expect(await browser.elementById('destination-dynamic').text()).toBe(
        'Dynamic data loaded'
      )
    })

    // useOffline() should return false after reconnection
    expect(await browser.elementById('offline-status').text()).toBe('online')
  })

  it('shows offline indicator even without prefetch data', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    expect(await browser.elementById('home').text()).toContain('Home')
    expect(await browser.elementById('offline-status').text()).toBe('online')

    // Go offline BEFORE revealing the link — no prefetch will happen.
    await goOffline(page!)

    // Reveal the link and click it. Both the prefetch and the navigation
    // fetch will fail since we're offline.
    const toggle = await browser.elementByCss(
      'input[data-link-accordion="/destination"]'
    )
    await toggle.click()
    const link = await browser.elementByCss('a[href="/destination"]')
    await link.click()

    // The optimistic update should still surface the offline state even
    // though the navigation is stuck in a pending transition with no
    // cached data at all.
    await retry(async () => {
      expect(await browser.elementById('offline-status').text()).toBe('offline')
    })
    expect(await browser.hasElementByCssSelector('#destination-content')).toBe(
      false
    )
    expect(await browser.elementById('home').text()).toContain('Home')

    // Restore connectivity. Navigation should complete.
    await goOnline(page!)

    await retry(async () => {
      expect(await browser.elementById('destination-dynamic').text()).toBe(
        'Dynamic data loaded'
      )
    })
    expect(await browser.elementById('offline-status').text()).toBe('online')
  })

  it('updates offline indicator immediately on disconnect', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    expect(await browser.elementById('offline-status').text()).toBe('online')

    // Disconnect without performing any navigation. The offline event
    // should flip useOffline() to true immediately.
    await goOffline(page!)

    await retry(async () => {
      expect(await browser.elementById('offline-status').text()).toBe('offline')
    })

    // Reconnect. The online event triggers a connectivity check, and
    // useOffline() should flip back to false.
    await goOnline(page!)

    await retry(async () => {
      expect(await browser.elementById('offline-status').text()).toBe('online')
    })
  })
})

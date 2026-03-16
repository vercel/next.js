import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache (per-page dynamic stale time)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  async function startBrowserWithFakeClock(url: string) {
    let page!: Playwright.Page
    const startDate = Date.now()

    const browser = await next.browser(url, {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
      },
    })

    const act = createRouterAct(page)

    return { browser, page, act, startDate }
  }

  it('reuses dynamic data within the per-page stale time window', async () => {
    const { browser, page, act, startDate } =
      await startBrowserWithFakeClock('/per-page-config')

    // Navigate to the dynamic page with unstable_dynamicStaleTime = 60
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/dynamic-stale-60"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-60"]'
        )
        await link.click()
      },
      {
        includes: 'Dynamic content (stale time 60s)',
      }
    )
    expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
      'Dynamic content (stale time 60s)'
    )

    // Go back to the starting page
    await browser.back()

    // Advance to 59 seconds. The per-page stale time is 60s (which overrides
    // the global staleTimes.dynamic of 30s), so the data should still be fresh.
    await page.clock.setFixedTime(startDate + 59 * 1000)

    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/per-page-config/dynamic-stale-60"]'
      )
      await link.click()
      expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
        'Dynamic content (stale time 60s)'
      )
    }, 'no-requests')

    // Go back again
    await browser.back()

    // Advance to 60 seconds. The data is now stale, so a new request
    // should be made.
    await page.clock.setFixedTime(startDate + 60 * 1000)

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-60"]'
        )
        await link.click()
      },
      { includes: 'Dynamic content (stale time 60s)' }
    )
    expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
      'Dynamic content (stale time 60s)'
    )
  })

  it('back/forward navigation always reuses BFCache regardless of stale time', async () => {
    const { browser, page, act, startDate } =
      await startBrowserWithFakeClock('/per-page-config')

    // Navigate to the dynamic page with unstable_dynamicStaleTime = 60
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/dynamic-stale-60"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-60"]'
        )
        await link.click()
      },
      {
        includes: 'Dynamic content (stale time 60s)',
      }
    )
    expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
      'Dynamic content (stale time 60s)'
    )

    // Go back to the starting page
    await browser.back()

    // Advance time well past the 60s stale time
    await page.clock.setFixedTime(startDate + 120 * 1000)

    // Use browser.forward() to go forward. Back/forward navigation should
    // always reuse the BFCache, regardless of stale time.
    await act(async () => {
      await browser.forward()
      expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
        'Dynamic content (stale time 60s)'
      )
    }, 'no-requests')
  })

  it('two dynamic pages with different stale times behave independently', async () => {
    const { browser, page, act, startDate } =
      await startBrowserWithFakeClock('/per-page-config')

    // Navigate to the dynamic page with unstable_dynamicStaleTime = 60
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/dynamic-stale-60"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-60"]'
        )
        await link.click()
      },
      {
        includes: 'Dynamic content (stale time 60s)',
      }
    )
    expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
      'Dynamic content (stale time 60s)'
    )

    // Go back to the starting page
    await browser.back()

    // Navigate to the dynamic page with unstable_dynamicStaleTime = 10
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/dynamic-stale-10"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-10"]'
        )
        await link.click()
      },
      {
        includes: 'Dynamic content (stale time 10s)',
      }
    )
    expect(await browser.elementById('dynamic-stale-10-content').text()).toBe(
      'Dynamic content (stale time 10s)'
    )

    // Go back to the starting page
    await browser.back()

    // Advance to 11 seconds. The 10s page should be stale, but the 60s page
    // should still be fresh.
    await page.clock.setFixedTime(startDate + 11 * 1000)

    // Navigate to the 10s page — should be stale, triggering a new request
    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-10"]'
        )
        await link.click()
      },
      { includes: 'Dynamic content (stale time 10s)' }
    )
    expect(await browser.elementById('dynamic-stale-10-content').text()).toBe(
      'Dynamic content (stale time 10s)'
    )

    // Go back to the starting page
    await browser.back()

    // Navigate to the 60s page — should still be fresh, no new request
    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/per-page-config/dynamic-stale-60"]'
      )
      await link.click()
      expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
        'Dynamic content (stale time 60s)'
      )
    }, 'no-requests')
  })

  it('per-page value overrides global staleTimes.dynamic regardless of direction', async () => {
    // The global staleTimes.dynamic is 30s. This test verifies that a per-page
    // value of 10s (smaller) causes the data to expire sooner, and a per-page
    // value of 60s (larger) causes the data to last longer.
    const { browser, page, act, startDate } =
      await startBrowserWithFakeClock('/per-page-config')

    // Navigate to the 10s page
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/dynamic-stale-10"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-10"]'
        )
        await link.click()
      },
      { includes: 'Dynamic content (stale time 10s)' }
    )

    await browser.back()

    // At 11s the 10s page should be stale, even though the global default
    // is 30s. This proves a smaller per-page value overrides the global.
    await page.clock.setFixedTime(startDate + 11 * 1000)

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-10"]'
        )
        await link.click()
      },
      { includes: 'Dynamic content (stale time 10s)' }
    )

    await browser.back()

    // Now navigate to the 60s page
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/dynamic-stale-60"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/dynamic-stale-60"]'
        )
        await link.click()
      },
      { includes: 'Dynamic content (stale time 60s)' }
    )

    await browser.back()

    // At 42s from the 60s page's navigation (11s + 31s), the data should
    // still be fresh — the per-page value of 60s overrides the global 30s.
    await page.clock.setFixedTime(startDate + 42 * 1000)

    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/per-page-config/dynamic-stale-60"]'
      )
      await link.click()
      expect(await browser.elementById('dynamic-stale-60-content').text()).toBe(
        'Dynamic content (stale time 60s)'
      )
    }, 'no-requests')
  })

  it('with parallel routes, uses the minimum stale time across all slots', async () => {
    const { browser, page, act, startDate } =
      await startBrowserWithFakeClock('/per-page-config')

    // Navigate to a page with parallel routes: slot A has
    // unstable_dynamicStaleTime = 60, slot B has
    // unstable_dynamicStaleTime = 15. The effective stale time should be
    // min(60, 15) = 15.
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/per-page-config/parallel-slots"]'
        )
        await toggle.click()
        const link = await browser.elementByCss(
          'a[href="/per-page-config/parallel-slots"]'
        )
        await link.click()
      },
      {
        includes: 'Slot A content',
      }
    )
    expect(await browser.elementById('slot-a-content').text()).toBe(
      'Slot A content (stale time 60s)'
    )
    expect(await browser.elementById('slot-b-content').text()).toBe(
      'Slot B content (stale time 15s)'
    )

    await browser.back()

    // At 14s both slots should still be fresh (min is 15s)
    await page.clock.setFixedTime(startDate + 14 * 1000)

    await act(async () => {
      const link = await browser.elementByCss(
        'a[href="/per-page-config/parallel-slots"]'
      )
      await link.click()
      expect(await browser.elementById('slot-a-content').text()).toBe(
        'Slot A content (stale time 60s)'
      )
      expect(await browser.elementById('slot-b-content').text()).toBe(
        'Slot B content (stale time 15s)'
      )
    }, 'no-requests')

    await browser.back()

    // At 16s the data should be stale because slot B's stale time (15s)
    // has elapsed.
    await page.clock.setFixedTime(startDate + 16 * 1000)

    await act(
      async () => {
        const link = await browser.elementByCss(
          'a[href="/per-page-config/parallel-slots"]'
        )
        await link.click()
      },
      { includes: 'Slot A content' }
    )
  })
})

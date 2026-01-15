import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache - export const staleTime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in development', () => {})
    return
  }

  it('overrides global staleTimes config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()

    // Prefetch page with staleTime=300 (5 minutes)
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/stale-5-minutes"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      { includes: 'Page with staleTime = 300' }
    )

    // Hide link
    await toggleLink.click()

    // Advance 31 seconds - past global staleTimes (30s), within page staleTime (300s)
    await page.clock.fastForward(31 * 1000)

    // Should NOT refetch - page's staleTime=300 hasn't elapsed
    await act(async () => {
      await toggleLink.click()
      await browser.elementByCss('a[href="/stale-5-minutes"]')
    }, 'no-requests')

    // Hide link
    await toggleLink.click()

    // Advance to 5 minutes + 1ms total - past staleTime=300
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      { includes: 'Page with staleTime = 300' }
    )
  })

  it('nested layouts - innermost staleTime wins', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()

    // Prefetch page with nested layouts (outer=100, inner=200)
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/nested/inner"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/nested/inner"]')
      },
      { includes: 'Page inheriting staleTime from inner layout' }
    )

    // Hide link
    await toggleLink.click()

    // Advance 101 seconds - past outer (100), within inner (200)
    await page.clock.fastForward(101 * 1000)

    // Should NOT refetch - inner layout's staleTime=200 wins
    await act(async () => {
      await toggleLink.click()
      await browser.elementByCss('a[href="/nested/inner"]')
    }, 'no-requests')

    // Hide link
    await toggleLink.click()

    // Advance to 201 seconds total - past inner's staleTime (200)
    await page.clock.fastForward(100 * 1000)

    // Should refetch - staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/nested/inner"]')
      },
      { includes: 'Page inheriting staleTime from inner layout' }
    )
  })

  it('page inherits staleTime from layout', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()

    // Prefetch page that inherits staleTime=120 from layout
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/inherit"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/inherit"]')
      },
      { includes: 'Page inheriting staleTime from layout' }
    )

    // Hide link
    await toggleLink.click()

    // Advance 119 seconds - within layout's staleTime (120)
    await page.clock.fastForward(119 * 1000)

    // Should NOT refetch - still within staleTime
    await act(async () => {
      await toggleLink.click()
      await browser.elementByCss('a[href="/inherit"]')
    }, 'no-requests')

    // Hide link
    await toggleLink.click()

    // Advance past 120 seconds total
    await page.clock.fastForward(2 * 1000)

    // Should refetch - staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/inherit"]')
      },
      { includes: 'Page inheriting staleTime from layout' }
    )
  })
})

import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache - export const unstable_staleTime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped', () => {})
    return
  }

  it('overrides global staleTimes.static config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Static page with unstable_staleTime = 300'

    // Prefetch static page with unstable_staleTime=300 (5 minutes)
    const toggleLink = await browser.elementByCss(
      'input[data-link-accordion="/static-stale-5-minutes"]'
    )
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-5-minutes"]')
      },
      { includes: pageContent }
    )

    // Hide link
    await toggleLink.click()

    // Advance 31 seconds - past global staleTimes.static (30s), within page unstable_staleTime (300s)
    await page.clock.fastForward(31 * 1000)

    // Should NOT refetch page content - page's unstable_staleTime=300
    // hasn't elapsed.
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-5-minutes"]')
      },
      { includes: pageContent, block: 'reject' }
    )

    // Hide link
    await toggleLink.click()

    // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-5-minutes"]')
      },
      { includes: pageContent }
    )
  })

  it('overrides global staleTimes.dynamic config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)
    await page.clock.install()
    const pageContent = 'Dynamic page with unstable_staleTime = 300'

    // Navigate to dynamic page with unstable_staleTime=300 (5 minutes)
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent }
    )

    // Advance 31 seconds - past global staleTimes.dynamic (30s), within page unstable_staleTime (300s)
    await browser.back()
    await page.clock.fastForward(31 * 1000)

    // Navigation should NOT refetch - page's unstable_staleTime=300 hasn't
    // elapsed.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
        .click()
      await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
    }, 'no-requests')

    // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
    await browser.back()
    await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent }
    )
  })
})

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

  it('overrides the global staleTimes.static config value during prefetching', async () => {
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
    await page.clock.fastForward('00:31')

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
    await page.clock.fastForward('05:00')

    // Should refetch - unstable_staleTime has elapsed
    await act(
      async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/static-stale-5-minutes"]')
      },
      { includes: pageContent }
    )
  })

  it('overrides the global staleTimes.dynamic config value when navigating back via link', async () => {
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
    await page.clock.fastForward('00:31')

    // Navigate back to home using a link in the page.
    await browser.elementByCss('#back-to-home').click()
    await browser.elementByCss(
      'input[data-link-accordion="/dynamic-stale-5-minutes"]'
    )

    // Navigation should NOT refetch - page's unstable_staleTime=300 hasn't
    // elapsed.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
        .click()
      await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
    }, 'no-requests')

    // Advance to 5 minutes + 31s total - past unstable_staleTime=300
    await page.clock.fastForward('05:00')

    // Navigate back to home using a link in the page.
    await browser.elementByCss('#back-to-home').click()
    await browser.elementByCss(
      'input[data-link-accordion="/dynamic-stale-5-minutes"]'
    )

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

  it('overrides the global staleTimes.dynamic config value when navigating back via browser back', async () => {
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
    await page.clock.fastForward('00:31')
    await browser.back()

    // Navigation should NOT refetch - page's unstable_staleTime=300 hasn't
    // elapsed.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-stale-5-minutes"]')
          .click()
        await browser.elementByCss('a[href="/dynamic-stale-5-minutes"]').click()
      },
      { includes: pageContent, block: 'reject' }
    )

    // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
    await page.clock.fastForward('05:00')
    await browser.back()

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

import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'
;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
  'segment cache - export const unstable_staleTime',
  () => {
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

      // Prefetch page with unstable_staleTime=300 (5 minutes)
      const toggleLink = await browser.elementByCss(
        'input[data-link-accordion="/stale-5-minutes"]'
      )
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/stale-5-minutes"]')
        },
        { includes: 'Page with unstable_staleTime = 300' }
      )

      // Hide link
      await toggleLink.click()

      // Advance 31 seconds - past global staleTimes (30s), within page unstable_staleTime (300s)
      await page.clock.fastForward(31 * 1000)

      // Should NOT refetch - page's unstable_staleTime=300 hasn't elapsed
      await act(async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      }, 'no-requests')

      // Hide link
      await toggleLink.click()

      // Advance to 5 minutes + 1ms total - past unstable_staleTime=300
      await page.clock.fastForward(5 * 60 * 1000 - 31 * 1000 + 1)

      // Should refetch - unstable_staleTime has elapsed
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/stale-5-minutes"]')
        },
        { includes: 'Page with unstable_staleTime = 300' }
      )
    })

    it('nested layouts - innermost unstable_staleTime wins', async () => {
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
        { includes: 'Page inheriting unstable_staleTime from inner layout' }
      )

      // Hide link
      await toggleLink.click()

      // Advance 101 seconds - past outer (100), within inner (200)
      await page.clock.fastForward(101 * 1000)

      // Should NOT refetch - inner layout's unstable_staleTime=200 wins
      await act(async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/nested/inner"]')
      }, 'no-requests')

      // Hide link
      await toggleLink.click()

      // Advance to 201 seconds total - past inner's unstable_staleTime (200)
      await page.clock.fastForward(100 * 1000)

      // Should refetch - unstable_staleTime has elapsed
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/nested/inner"]')
        },
        { includes: 'Page inheriting unstable_staleTime from inner layout' }
      )
    })

    it('page inherits unstable_staleTime from layout', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)
      await page.clock.install()

      // Prefetch page that inherits unstable_staleTime=120 from layout
      const toggleLink = await browser.elementByCss(
        'input[data-link-accordion="/inherit"]'
      )
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/inherit"]')
        },
        { includes: 'Page inheriting unstable_staleTime from layout' }
      )

      // Hide link
      await toggleLink.click()

      // Advance 119 seconds - within layout's unstable_staleTime (120)
      await page.clock.fastForward(119 * 1000)

      // Should NOT refetch - still within unstable_staleTime
      await act(async () => {
        await toggleLink.click()
        await browser.elementByCss('a[href="/inherit"]')
      }, 'no-requests')

      // Hide link
      await toggleLink.click()

      // Advance past 120 seconds total
      await page.clock.fastForward(2 * 1000)

      // Should refetch - unstable_staleTime has elapsed
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/inherit"]')
        },
        { includes: 'Page inheriting unstable_staleTime from layout' }
      )
    })

    it('page unstable_staleTime overrides layout unstable_staleTime', async () => {
      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      const act = createRouterAct(page)
      await page.clock.install()

      // Prefetch page where page has unstable_staleTime=60, layout has unstable_staleTime=180
      const toggleLink = await browser.elementByCss(
        'input[data-link-accordion="/override"]'
      )
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/override"]')
        },
        { includes: 'Page with unstable_staleTime = 60' }
      )

      // Hide link
      await toggleLink.click()

      // Advance 61 seconds - past page's unstable_staleTime (60), within layout's (180)
      await page.clock.fastForward(61 * 1000)

      // Should refetch - page's unstable_staleTime=60 wins over layout's unstable_staleTime=180
      await act(
        async () => {
          await toggleLink.click()
          await browser.elementByCss('a[href="/override"]')
        },
        { includes: 'Page with unstable_staleTime = 60' }
      )
    })

    // TODO: Test for caching unstable_staleTime on navigation without prefetch
    //
    // Currently, navigation responses (without prefetch) cache the route tree
    // but not the segment data. The route tree cache entry is found on subsequent
    // navigations, but since segment data isn't cached, a server request is still
    // made. Fully implementing this feature requires writing segment data to the
    // segment cache during navigation, which is a more significant change.
    //
    // The unstable_staleTime segment config works correctly for prefetched routes.
  }
)

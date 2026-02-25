import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache (staleness)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development / deployment', () => {})
    return
  }

  it('entry expires when its stale time has elapsed', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    await page.clock.install()

    // Reveal the link to trigger a prefetch
    const toggle2MinutesLink = await browser.elementByCss(
      'input[data-link-accordion="/stale-2-minutes"]'
    )
    const toggle4MinutesLink = await browser.elementByCss(
      'input[data-link-accordion="/stale-4-minutes"]'
    )
    await act(
      async () => {
        await toggle2MinutesLink.click()
        await browser.elementByCss('a[href="/stale-2-minutes"]')
      },
      {
        includes: 'Content with stale time of 2 minutes',
      }
    )
    await act(
      async () => {
        await toggle4MinutesLink.click()
        await browser.elementByCss('a[href="/stale-4-minutes"]')
      },
      {
        includes: 'Content with stale time of 4 minutes',
      }
    )

    // Hide the links
    await toggle2MinutesLink.click()
    await toggle4MinutesLink.click()

    // Fast forward 2 minutes and 1 millisecond
    await page.clock.fastForward(2 * 60 * 1000 + 1)

    // Reveal the links again to trigger new prefetch tasks
    await act(
      async () => {
        await toggle2MinutesLink.click()
        await browser.elementByCss('a[href="/stale-2-minutes"]')
      },
      // The page with a stale time of 2 minutes is requested again
      // because its stale time elapsed.
      {
        includes: 'Content with stale time of 2 minutes',
      }
    )

    await act(
      async () => {
        await toggle4MinutesLink.click()
        await browser.elementByCss('a[href="/stale-4-minutes"]')
      },
      // The page with a stale time of 4 minutes is *not* requested again
      // because it's still fresh.
      'no-requests'
    )
  })

  it('expires runtime prefetches when their stale time has elapsed', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    await page.clock.install()

    // Reveal the links to trigger a runtime prefetch
    const toggle2MinutesLink = await browser.elementByCss(
      'input[data-link-accordion="/runtime-stale-2-minutes"]'
    )
    const toggle4MinutesLink = await browser.elementByCss(
      'input[data-link-accordion="/runtime-stale-4-minutes"]'
    )
    await act(
      async () => {
        await toggle2MinutesLink.click()
        await browser.elementByCss('a[href="/runtime-stale-2-minutes"]')
      },
      {
        includes: 'Content with stale time of 2 minutes',
      }
    )
    await act(
      async () => {
        await toggle4MinutesLink.click()
        await browser.elementByCss('a[href="/runtime-stale-4-minutes"]')
      },
      {
        includes: 'Content with stale time of 4 minutes',
      }
    )

    // Hide the links
    await toggle2MinutesLink.click()
    await toggle4MinutesLink.click()

    // Fast forward 2 minutes and 1 millisecond
    await page.clock.fastForward(2 * 60 * 1000 + 1)

    // Reveal the links again to trigger new prefetch tasks
    await act(
      async () => {
        await toggle2MinutesLink.click()
        await browser.elementByCss('a[href="/runtime-stale-2-minutes"]')
      },
      // The page with a stale time of 2 minutes is requested again
      // because its stale time elapsed.
      {
        includes: 'Content with stale time of 2 minutes',
      }
    )

    await act(
      async () => {
        await toggle4MinutesLink.click()
        await browser.elementByCss('a[href="/runtime-stale-4-minutes"]')
      },
      // The page with a stale time of 4 minutes is *not* requested again
      // because it's still fresh.
      'no-requests'
    )
  })

  it('reuses dynamic data up to the staleTimes.dynamic threshold', async () => {
    let page: Playwright.Page
    const startDate = Date.now()

    const browser = await next.browser('/', {
      async beforePageLoad(p: Playwright.Page) {
        page = p
        await page.clock.install()
        await page.clock.setFixedTime(startDate)
      },
    })

    const act = createRouterAct(page)

    // Navigate to the dynamic page
    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/dynamic"]'
        )
        await toggle.click()
        const link = await browser.elementByCss('a[href="/dynamic"]')
        await link.click()
      },
      {
        includes: 'Dynamic content',
      }
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )

    await browser.back()

    // Advance time by 29 seconds. staleTimes.dynamic is configured as 30s, so
    // if we navigate to the same link again, the old data should be reused
    // without a new network request.
    await page.clock.setFixedTime(startDate + 29 * 1000)

    await act(async () => {
      const link = await browser.elementByCss('a[href="/dynamic"]')
      await link.click()
      // The next page is immediately rendered
      expect(await browser.elementById('dynamic-content').text()).toBe(
        'Dynamic content'
      )
    }, 'no-requests')

    await browser.back()

    // Advance an additional second. This time, if we navigate to the link
    // again, the data is stale, so we issue a new request.
    await page.clock.setFixedTime(startDate + 30 * 1000)

    await act(
      async () => {
        const link = await browser.elementByCss('a[href="/dynamic"]')
        await link.click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )
  })

  it('caches omitted from the prerender should not affect when the prefetch is expired', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    await page.clock.install()

    // Reveal the link to trigger a prefetch
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/seconds"]')
          .click()
        await browser.elementByCss('a[href="/seconds"]')
      },
      {
        // cacheLife("seconds") should be excluded from a static prerender
        includes: 'Short-lived cached content',
        block: 'reject',
      }
    )

    // Hide the link
    await browser.elementByCss('input[data-link-accordion="/seconds"]').click()

    // Fast forward 30 seconds and 1 millisecond
    // (matching the staleness of the "seconds" profile)
    const timeStep = 30 * 1000 + 1
    await page.clock.fastForward(timeStep)

    // Reveal the link again to trigger new prefetch tasks.
    // The cache with `cacheLife('seconds'`) should not affect the stale time of the prefetch,
    // because we omit it from the prerender, so we shouldn't refetch anything yet.
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/seconds"]')
        .click()
      await browser.elementByCss('a[href="/seconds"]')
    }, 'no-requests')

    // Hide the link again
    await browser.elementByCss('input[data-link-accordion="/seconds"]').click()

    // Fast forward to 5 minutes and 1 millisecond after the prefetch.
    // (matching the staleness of the "minutes" profile)
    // Note that we should exclude the timestep we've already done.
    await page.clock.fastForward(5 * 60 * 1000 + 1 - timeStep)

    // Reveal the link to trigger a prefetch.
    // The longer-lived cache we used on the page should make the previous prefetch expire,
    // so we should issue a new request.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/seconds"]')
          .click()
        await browser.elementByCss('a[href="/seconds"]')
      },
      {
        includes: 'Short-lived cached content',
        block: 'reject',
      }
    )
  })
})

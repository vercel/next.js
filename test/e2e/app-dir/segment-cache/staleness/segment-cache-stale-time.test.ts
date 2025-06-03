import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'

describe('segment cache (staleness)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
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
    const toggle5MinutesLink = await browser.elementByCss(
      'input[data-link-accordion="/stale-5-minutes"]'
    )
    const toggle10MinutesLink = await browser.elementByCss(
      'input[data-link-accordion="/stale-10-minutes"]'
    )
    await act(
      async () => {
        await toggle5MinutesLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      {
        includes: 'Content with stale time of 5 minutes',
      }
    )
    await act(
      async () => {
        await toggle10MinutesLink.click()
        await browser.elementByCss('a[href="/stale-10-minutes"]')
      },
      {
        includes: 'Content with stale time of 10 minutes',
      }
    )

    // Hide the links
    await toggle5MinutesLink.click()
    await toggle10MinutesLink.click()

    // Fast forward 5 minutes and 1 millisecond
    await page.clock.fastForward(5 * 60 * 1000 + 1)

    // Reveal the links again to trigger new prefetch tasks
    await act(
      async () => {
        await toggle5MinutesLink.click()
        await browser.elementByCss('a[href="/stale-5-minutes"]')
      },
      // The page with a stale time of 5 minutes is requested again
      // because its stale time elapsed.
      {
        includes: 'Content with stale time of 5 minutes',
      }
    )

    await act(
      async () => {
        await toggle10MinutesLink.click()
        await browser.elementByCss('a[href="/stale-10-minutes"]')
      },
      // The page with a stale time of 10 minutes is *not* requested again
      // because it's still fresh.
      'no-requests'
    )
  })

  it('reuses dynamic data up to the staleTimes.dynamic threshold', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    await page.clock.install()

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

    // Fast forward 29 seconds. staleTimes.dynamic is configured as 30s, so if
    // we navigate to the same link again, the old data should be reused without
    // a new network request.
    await page.clock.fastForward(29 * 1000)

    await act(async () => {
      const toggle = await browser.elementByCss(
        'input[data-link-accordion="/dynamic"]'
      )
      await toggle.click()
      const link = await browser.elementByCss('a[href="/dynamic"]')
      await link.click()
      // The next page is immediately rendered
      expect(await browser.elementById('dynamic-content').text()).toBe(
        'Dynamic content'
      )
    }, 'no-requests')

    await browser.back()

    // Fast forward an additional second. This time, if we navigate to the link
    // again, the data is stale, so we issue a new request.
    await page.clock.fastForward(1 * 1000)

    await act(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/dynamic"]'
        )
        await toggle.click()
        const link = await browser.elementByCss('a[href="/dynamic"]')
        await link.click()
      },
      { includes: 'Dynamic content' }
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content'
    )
  })
})

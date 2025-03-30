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
})

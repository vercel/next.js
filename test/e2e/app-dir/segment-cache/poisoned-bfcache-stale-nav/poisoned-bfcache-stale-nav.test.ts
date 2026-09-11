import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache (poisoned BFCache / staleTimes.dynamic)', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Prefetch + BFCache reuse of dynamic data is a production client behavior.
    it('disabled in development', () => {})
    return
  }

  it('does not drop a later click after a stalled RSC navigation (issue 98066)', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link so the /stalled-page route tree is prefetched — the
    // same starting state as a visible <Link> in production (#98066).
    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/stalled-page"]')
        .click()
      await browser.elementByCss('a[href="/stalled-page"]')
    })

    // Stall only RSC requests for /stalled-page, matching the issue author's
    // harness. The route is not named /target because that path is gitignored
    // (Cargo `target/` directories).
    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window)
      ;(window as any).__restoreFetch = () => {
        window.fetch = originalFetch
      }
      window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input)
        if (url.includes('_rsc') && url.includes('/stalled-page')) {
          ;(window as any).__hungStalledRsc = true
          return new Promise<Response>(() => {})
        }
        return originalFetch(input, init)
      }
    })

    // Poisoning click: the dynamic request hangs, writeToBFCache parks the
    // unsettled rsc promise, and the URL does not change.
    await browser.elementByCss('a[href="/stalled-page"]').click()
    await retry(async () => {
      const hung = await page.evaluate(
        () => (window as any).__hungStalledRsc === true
      )
      expect(hung).toBe(true)
    })
    expect(await browser.url()).not.toContain('/stalled-page')

    // Hide the poisoned link so it cannot re-prefetch outside an act scope.
    await browser
      .elementByCss('input[data-link-accordion="/stalled-page"]')
      .click()

    // Network is fully restored. Other routes must keep working, and a later
    // click to the poisoned route must issue a request and commit — not reuse
    // the BFCache entry with needsDynamicRequest: false.
    await page.evaluate(() => {
      ;(window as any).__restoreFetch()
    })

    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/other"]').click()
      const link = await browser.elementByCss('a[href="/other"]')
      await link.click()
    })
    expect(await browser.elementById('other-heading').text()).toBe(
      'Issue 98066 other page'
    )

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/stalled-page"]')
          .click()
        const link = await browser.elementByCss('a[href="/stalled-page"]')
        await link.click()
      },
      { includes: 'Issue 98066 stalled page' }
    )

    await retry(async () => {
      expect(await browser.elementById('stalled-page-heading').text()).toBe(
        'Issue 98066 stalled page'
      )
    })
    expect(await browser.url()).toContain('/stalled-page')
  })
})

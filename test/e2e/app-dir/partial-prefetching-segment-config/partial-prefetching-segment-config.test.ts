import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('partial prefetching segment config', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('includes dynamic data in the prefetch when the route has no partial prefetching config', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger its prefetch. The Link has prefetch={true},
    // the target route has no per-segment config, and this app does NOT enable
    // partial prefetching globally. So the legacy behavior applies: the
    // prefetch is a full prefetch that includes dynamic data.
    //
    // This is the control case. It's the first place we assert the "dynamic IS
    // prefetched" direction, which proves the opt-in case below is meaningful.
    await act(
      async () => {
        const linkToggle = await browser.elementByCss(
          'input[data-link-accordion="/default-route"]'
        )
        await linkToggle.click()
      },
      { includes: 'Default dynamic' }
    )
  })

  it('does not prefetch dynamic data for a route with unstable_prefetch = "partial"', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger its prefetch. The Link has prefetch={true},
    // and the target route opts into partial prefetching via
    // `export const unstable_prefetch = 'partial'`. So the prefetch should
    // include the static shell, but NOT the dynamic data — even though the
    // global config does not enable partial prefetching.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/partial-route"]'
      )
      await linkToggle.click()
    }, [
      { includes: 'Partial static' },
      { includes: 'Partial dynamic', block: 'reject' },
    ])
  })
})

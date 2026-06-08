import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('partial prefetching config', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('does not prefetch dynamic data, even when <Link prefetch={true}>', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger its prefetch. The Link has prefetch={true},
    // and the target page has no per-segment config, so the behavior is
    // determined by the global Next.js config. Because Partial Prefetching is
    // enabled, the prefetch should include static content, but NOT
    // dynamic data.
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/target-page"]'
      )
      await linkToggle.click()
    }, [
      { includes: 'Static content' },
      { includes: 'Dynamic content', block: 'reject' },
    ])
  })
})

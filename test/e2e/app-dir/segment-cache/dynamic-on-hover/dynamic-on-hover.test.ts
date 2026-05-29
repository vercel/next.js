import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('dynamic on hover', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  it('prefetches the dynamic data for a Link on hover', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // This Link's unstable_dynamicOnHover prop is set to true
    const linkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/dynamic"]'
    )

    // Reveal the link to start prefetching. Since the link has not been hovered
    // yet, the prefetch only includes static data.
    await act(async () => {
      await linkVisibilityToggle.click()
      await browser.elementByCss('a[href="/dynamic"]')
    }, [
      {
        includes: 'Static content in layout of dynamic page',
      },
      {
        includes: 'Loading dynamic data...',
      },
    ])

    // Hover over the link to prefetch the dynamic data
    const link = await browser.elementByCss('a[href="/dynamic"]')
    await act(async () => {
      await link.hover()
    }, [
      // The dynamic data was prefetched
      {
        includes: 'Dynamic content',
      },
      // The static content in the layout was not fetched again, because it
      // was already cached.
      {
        includes: 'Static content in layout of dynamic page',
        block: 'reject',
      },
    ])

    // When navigating to the page, no additional requests are issued, because
    // the entire page was prefetched.
    await act(async () => {
      await link.click()
    }, 'no-requests')
  })
})

import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('force stale', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled in dev', () => {})
    return
  }

  it(
    'during a navigation, don\'t request segments that have a pending "full" ' +
      'prefetch already in progress',
    async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          // Reveal a link to a dynamic page. The Link has prefetch={true}, so the
          // full page data is prefetched, including dynamic content.
          const toggleLinkVisibility = await browser.elementByCss(
            'input[data-link-accordion="/dynamic"]'
          )
          await act(async () => await toggleLinkVisibility.click(), {
            includes: 'Dynamic page content',
            // Block the data from loading into the client so we can test what
            // happens if we request the same segment again during a navigation.
            block: true,
          })

          // Initiate a navigation to the dynamic page. Even though the dynamic
          // content from the prefetch hasn't loaded yet, the router should not
          // request the same segment again, because it knows the data it
          // receives from the prefetch will be complete. This assumption is
          // _only_ correct for "full" prefetches, because we explicitly instruct
          // the server not to omit any dynamic or runtime data.
          const link = await browser.elementByCss('a[href="/dynamic"]')
          await link.click()
        },
        // There should have been no additional requests upon navigation
        'no-requests'
      )

      // The data succesfully streams in.
      const content = await browser.elementById('dynamic-page-content')
      expect(await content.text()).toBe('Dynamic page content')
    }
  )
})

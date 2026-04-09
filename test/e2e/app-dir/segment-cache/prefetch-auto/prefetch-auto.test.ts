import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('<Link prefetch="auto">', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    it('disabled in development / deployment', () => {})
    return
  }

  // NOTE: Since "auto" is just an alias for the default, I'm not bothering to
  // write tests for every default prefetching behavior; that's covered by a
  // bunch of other test suites. This is just a quick test to confirm that the
  // alias exists.

  it('<Link prefetch="auto"> works the same as if prefetch were undefined or null', async () => {
    // Test that the link only prefetches the static part of the target page
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    // Reveal the link to trigger a prefetch
    await act(async () => {
      const linkToggle = await browser.elementByCss(
        'input[data-link-accordion="/dynamic"]'
      )
      await linkToggle.click()
    }, [
      // Should prefetch the loading boundary
      {
        includes: 'Loading...',
      },
      // Should not prefetch the dynamic content
      {
        includes: 'Dynamic content',
        block: 'reject',
      },
    ])

    // Navigate to the page
    await act(
      async () => {
        await browser.elementByCss('a[href="/dynamic"]').click()
      },
      {
        // Now the dynamic content should be fetched
        includes: 'Dynamic content',
      }
    )
  })
})

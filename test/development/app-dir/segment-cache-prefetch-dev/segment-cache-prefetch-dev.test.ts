import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('segment cache prefetching in dev mode', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('prefetches and navigates correctly in dev mode', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Step 1: Reveal the link to trigger a viewport prefetch.
    // In dev mode the server returns a route-tree response (not full page
    // content), but we still expect at least one RSC request to be issued.
    await act!(async () => {
      const checkbox = await browser.elementByCss(
        'input[data-link-accordion="/page-b"]'
      )
      await checkbox.click()
    })

    // Step 2: Click the link. The navigation will fetch the page content.
    await act!(async () => {
      const link = await browser.elementByCss('a[href="/page-b"]')
      await link.click()
    })

    // Step 3: Verify the page content is correct.
    const heading = await browser.elementById('page-b-heading').text()
    expect(heading).toBe('Page B Content')

    const layout = await browser.elementById('page-b-layout').text()
    expect(layout).toContain('Page B Layout')
  })
})

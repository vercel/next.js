import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('client params', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  it('client segments that access dynamic params are fully statically prefetchable', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Prefetch the page. Although this page access dynamic params, it only
    // does so inside segments that are marked with "use cache". So we should
    // be able to fully prefetch them, without invoking a dynamic server render.
    const toggleLinkVisibility = await browser.elementByCss(
      'input[data-link-accordion="/clothing/1"]'
    )
    await act(async () => {
      await toggleLinkVisibility.click()
    })

    // Navigate to the fully prefetched page. There should be no
    // additionalrequest.
    const link = await browser.elementByCss('a[href="/clothing/1"]')
    await act(async () => {
      await link.click()
    }, 'no-requests')

    // Confirm the dynamic params were correctly rendered by the client.
    const categoryHeader = await browser.elementById('category-header')
    expect(await categoryHeader.text()).toBe('Category: clothing')
    const product = await browser.elementById('product')
    expect(await product.text()).toBe('Product: 1')
  })
})

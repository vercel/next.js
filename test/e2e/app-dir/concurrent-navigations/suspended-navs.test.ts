import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

describe('suspended navigations', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  function relativeHref(href: string) {
    const url = new URL(href)
    return url.pathname + url.search + url.hash
  }

  it('router.refresh() during a suspended navigation', async () => {
    let page: Playwright.Page
    const browser = await next.browser('/suspended-navs', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page)

    const serverActionButton = await browser.elementByCss(
      'button[data-navigate-button="/suspended-navs/target-page"]'
    )
    const clientRefreshButton = await browser.elementById(
      'client-refresh-button'
    )

    await act(async () => {
      // Click a button that runs a Server Action. This will suspend the router
      // because we don't know whether the action will result in a redirect,
      // or which URL it will redirect to.
      await serverActionButton.click()

      // While the router is suspended, trigger a refresh using
      // router.refresh(). This should not issue any requests yet, because the
      // refresh must be applied on top of the pending navigation.
      await act(async () => {
        await clientRefreshButton.click()
      }, 'no-requests')
    }, [
      // The Server Action eventually redirects to /suspended-navs/target-page
      { includes: 'target-page-content' },
      // Then we refresh, since there was a refresh after the action
      // was initiated.
      { includes: 'target-page-content' },
    ])

    expect(relativeHref(await browser.url())).toBe(
      '/suspended-navs/target-page'
    )
    expect(await browser.elementById('target-page-content').text()).toBe(
      'Target page'
    )

    // Even though the target page rendered twice on the server, on the client
    // it only rendered once, because the redirect and the refresh were
    // batched into a single navigation.
    const dynamicRenderCounter = await browser.elementById(
      'target-page-render-counter'
    )
    expect(await dynamicRenderCounter.text()).toBe('Target page renders: 1')
  })
})

import type * as Playwright from 'playwright'
import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

describe('prefetch inlining without cacheComponents', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('prefetch hints are only computed during build', () => {})
    return
  }

  it('static page is prefetched with inlining', async () => {
    // Static pages always have hints computed during the build, regardless
    // of cacheComponents. Inlining should work normally.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/static-page"]')
          .click()
      },
      { includes: 'Static page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/static-page"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-static').text()).toBe(
      'Static page'
    )
  })

  it('dynamic page is fully prefetched with prefetch={true}', async () => {
    // Without cacheComponents, dynamic pages have no static shell and
    // therefore no prerender pass to compute inlining hints. With
    // prefetch={true} on the Link, the client should still fully prefetch
    // the dynamic page content.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-page"]')
          .click()
      },
      { includes: 'Dynamic page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/dynamic-page"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-dynamic').text()).toBe(
      'Dynamic page'
    )
  })

  it('dynamic edge page is fully prefetched with prefetch={true}', async () => {
    // Edge runtime forces pages to be dynamic. Same as the non-edge
    // dynamic case: with prefetch={true}, the page content should be
    // fully prefetched before navigation.
    let page: Playwright.Page
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page!)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/dynamic-edge"]')
          .click()
      },
      { includes: 'Dynamic edge page' }
    )

    await act(async () => {
      await browser.elementByCss('a[href="/dynamic-edge"]').click()
    }, 'no-requests')

    expect(await browser.elementByCss('#page-dynamic-edge').text()).toBe(
      'Dynamic edge page'
    )
  })
})

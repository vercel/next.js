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

  it('with Partial Prefetching, prefetches the navigation stage on hover', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Reveal the link. It hasn't been hovered yet, so it only gets the shell.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/partial"]')
          .click()
        await browser.elementByCss('a[href="/partial"]')
      },
      { includes: 'Navigation content on partial page', block: 'reject' }
    )

    // Hover over the link. The route opts into Partial Prefetching, so
    // instead of a full prefetch, the link sends a runtime prefetch of the
    // navigation stage. It includes the content after navigation(), but not
    // the dynamic content.
    const link = await browser.elementByCss('a[href="/partial"]')
    await act(async () => {
      await link.hover()
    }, [
      { includes: 'Navigation content on partial page', kind: 'runtime' },
      { includes: 'Dynamic content on partial page', block: 'reject' },
    ])

    // The navigation shows the prefetched content right away, and only
    // fetches the dynamic content.
    await act(
      async () => {
        await link.click()
        // While the navigation response is blocked (we're still in the `act`
        // scope), the prefetched content is already visible.
        expect(await browser.elementById('navigation-content').text()).toBe(
          'Navigation content on partial page'
        )
        expect(await browser.elementById('dynamic-loading').text()).toBe(
          'Loading dynamic data...'
        )
      },
      { includes: 'Dynamic content on partial page' }
    )
    expect(await browser.elementById('dynamic-content').text()).toBe(
      'Dynamic content on partial page'
    )
  })
})

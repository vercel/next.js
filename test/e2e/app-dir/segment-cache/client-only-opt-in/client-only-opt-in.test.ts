import { nextTestSetup } from 'e2e-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from '../router-act'

describe('segment cache prefetch scheduling', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('prefetching is disabled', () => {})
    return
  }

  it('prefetches a static page in a single request', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    // Because per-segment prefetching is not enabled in this app, the attempt
    // to prefetch the route tree will return not just the tree but the data for
    // the entire page. Although this prevents us from deduping shared layouts,
    // we should seed the cache with the extra data to avoid a second request
    // for the data.
    const linkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/static"]'
    )
    await act(
      async () => {
        await linkVisibilityToggle.click()
      },
      {
        // This assertion will fail if this string appears in multiple requests.
        includes: 'Static Content',
      }
    )

    // When navigating to the prefetched static page, no additional requests
    // are issued.
    const link = await browser.elementByCss('a[href="/static"]')
    await act(async () => {
      await link.click()
      const staticContent = await browser.elementById('static-content')
      expect(await staticContent.innerHTML()).toBe('Static Content')
    }, 'no-requests')
  })

  it('prefetches a dynamic page (with PPR enabled)', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    const linkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/dynamic-with-ppr"]'
    )
    await act(async () => {
      await linkVisibilityToggle.click()
    }, [
      // This assertion will fail if this string appears in multiple requests.
      {
        includes: 'Loading dynamic content...',
      },
      // Does not include the dynamic content
      {
        block: 'reject',
        includes: 'Dynamic Content',
      },
    ])

    // When navigating to the prefetched dynamic page, an additional request
    // is issued to fetch the dynamic content.
    const link = await browser.elementByCss('a[href="/dynamic-with-ppr"]')
    await act(
      async () => {
        await link.click()
      },
      {
        includes: 'Dynamic Content',
      }
    )
    const dynamicContent = await browser.elementById('dynamic-content')
    expect(await dynamicContent.innerHTML()).toBe('Dynamic Content')
  })

  it('prefetches a dynamic page (without PPR enabled)', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        act = createRouterAct(p)
      },
    })

    const linkVisibilityToggle = await browser.elementByCss(
      'input[data-link-accordion="/dynamic-without-ppr"]'
    )
    await act(async () => {
      await linkVisibilityToggle.click()
    }, [
      // This assertion will fail if this string appears in multiple requests.
      {
        includes: 'Loading dynamic content...',
      },
      // Does not include the dynamic content
      {
        block: 'reject',
        includes: 'Dynamic Content',
      },
    ])

    // When navigating to the prefetched dynamic page, an additional request
    // is issued to fetch the dynamic content.
    const link = await browser.elementByCss('a[href="/dynamic-without-ppr"]')
    await act(
      async () => {
        await link.click()
      },
      {
        includes: 'Dynamic Content',
      }
    )
    const dynamicContent = await browser.elementById('dynamic-content')
    expect(await dynamicContent.innerHTML()).toBe('Dynamic Content')
  })
})

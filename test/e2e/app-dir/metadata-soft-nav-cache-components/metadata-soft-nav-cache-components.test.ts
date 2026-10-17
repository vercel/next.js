import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'
import { createRouterAct } from 'router-act'

// Regression test for GitHub #95268: with Cache Components + `partialPrefetching`,
// the metadata `<title>` is permanently dropped after a client-side navigation
// to a route with dynamic `generateMetadata` whose prefetch has already settled.
// The prefetch caches the route's App Shell, whose head does not include the
// dynamic title; the subsequent navigation must replace that prefetched head
// with the full head from the dynamic response. Previously it did not, so the
// title never appeared (only a hard reload fixed it).
describe('metadata-soft-nav-cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  it('applies dynamic metadata after navigating to an already-prefetched route', async () => {
    let page: Playwright.Page = null as any
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    expect(await browser.eval(() => document.title)).toBe('Home Default')

    // Reveal the link and let its prefetch fully settle (act waits for the
    // prefetch requests to complete). This caches the route's App Shell, whose
    // head does NOT include the dynamic metadata title.
    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/slow"]').click()
    })

    // Navigate to the now-prefetched route.
    await act(
      async () => {
        await browser.elementByCss('a[href="/slow"]').click()
      },
      { includes: 'Slow content' }
    )

    await browser.waitForElementByCss('#slow-content')

    // The title must resolve to the route's own metadata, merged with the
    // layout's template — not be permanently dropped to an empty string.
    await retry(async () => {
      expect(await browser.eval(() => document.title)).toBe('Slow Page | Site')
    })
  })

  it('does not blank a complete static title when navigating to a prefetched route with a dynamic body', async () => {
    let page: Playwright.Page = null as any
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    expect(await browser.eval(() => document.title)).toBe('Home Default')

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/static-meta"]')
        .click()
    })

    await act(
      async () => {
        await browser.elementByCss('a[href="/static-meta"]').click()
      },
      { includes: 'Static meta content' }
    )

    await browser.waitForElementByCss('#static-meta-content')

    await retry(async () => {
      expect(await browser.eval(() => document.title)).toBe(
        'Static Meta | Site'
      )
    })
  })

  it('does not reuse metadata across dynamic params', async () => {
    let page: Playwright.Page = null as any
    const browser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })

    // Reveal several links to the same dynamic route in one render. This
    // populates shared prefetch state for the route, while the final metadata
    // depends on the concrete `handle` param.
    await act(async () => {
      await browser.elementByCss('input[data-product-links]').click()
    })
    await act(async () => {
      await browser.elementByCss('a[href="/products/gamma"]').click()
    })
    await retry(async () => {
      expect(await browser.elementByCss('#product-title').text()).toBe(
        'Gamma Product'
      )
      expect(await browser.eval(() => document.title)).toBe(
        'Gamma Product | Site'
      )
    })

    await browser.elementByCss('a[href="/"]').click()
    await browser.waitForElementByCss('#home')

    // Beta is intentionally not prefetched. Its full navigation response
    // contains Beta's metadata and body; neither may be replaced by the
    // previously visited Gamma route's cached result.
    await browser.elementByCss('input[data-beta-link]').click()
    await browser.waitForElementByCss('a[href="/products/beta"]')

    await act(
      async () => {
        await browser.elementByCss('a[href="/products/beta"]').click()
      },
      { includes: 'Beta Product' }
    )
    await retry(async () => {
      expect(await browser.elementByCss('#product-title').text()).toBe(
        'Beta Product'
      )
      expect(await browser.eval(() => document.title)).toBe(
        'Beta Product | Site'
      )
    })
  })
})

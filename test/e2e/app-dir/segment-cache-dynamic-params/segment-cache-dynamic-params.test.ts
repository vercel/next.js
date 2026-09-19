import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import type { PrerenderManifest } from 'next/dist/build'
import type { FlightRouterState } from 'next/dist/shared/lib/app-router-types'
import { createRouterAct } from 'router-act'

describe('segment cache closed params (dynamicParams = false)', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  async function getClosedSegments(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    // If this private tree representation changes, reconstruct the regression
    // rather than preserving or exposing router internals just for this test.
    return browser.eval(() => {
      const closedSegments: string[] = []
      function visit(tree: FlightRouterState) {
        // PrefetchHint.IsClosedParam is a const enum bit. Check every node so
        // stamping the root, static segments, or page nodes also fails.
        if (((tree[4] ?? 0) & 0b1000000000000000) !== 0) {
          const segment = tree[0]
          closedSegments.push(
            typeof segment === 'string' ? segment : `[${segment[0]}]`
          )
        }
        for (const child of Object.values(tree[1])) visit(child)
      }
      visit(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree)
      return closedSegments
    })
  }

  async function hasClosedParamDescendants(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(() => {
      const tree: FlightRouterState =
        window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE.tree
      // PrefetchHint.SubtreeHasClosedParams summarizes descendants at the root.
      return ((tree[4] ?? 0) & 0b10000000000000000) !== 0
    })
  }

  // @force-gate prefetching
  it('rejects unlisted params at the routing level', async () => {
    const allowedResponse = await next.fetch('/products/allowed', {
      redirect: 'manual',
    })
    expect(allowedResponse.status).toBe(200)
    const allowed = cheerio.load(await allowedResponse.text())
    expect(allowed('#product-page').text()).toBe('Allowed product page')

    // The product page always returns successful UI; it never calls notFound().
    // An unlisted slug must be rejected by routing, without rendering either
    // the products layout or its nested not-found boundary.
    const rejectedResponse = await next.fetch('/products/rejected', {
      redirect: 'manual',
    })
    expect(rejectedResponse.status).toBe(404)
    const rejected = cheerio.load(await rejectedResponse.text())
    expect(rejected('#root-not-found').text()).toBe('Route not found')
    expect(
      rejected('#products-layout, #product-page, #nested-not-found').length
    ).toBe(0)

    // Verify that client route discovery is rejected too, rather than returning
    // a successful generic /products/[slug] tree for an invalid parameter.
    const headers = {
      RSC: '1',
      'Next-Router-Prefetch': '1',
      'Next-Router-Segment-Prefetch': '/_tree',
    }
    const allowedTree = await next.fetch('/products/allowed', { headers })
    expect(allowedTree.status).toBe(200)
    const rejectedTree = await next.fetch('/products/rejected', { headers })
    expect(rejectedTree.status).toBe(404)

    // Build artifacts are only available locally. The HTTP assertions above
    // also run against deployments and verify the externally visible contract.
    if (isNextStart) {
      const manifest: PrerenderManifest = await next.readJSON(
        '.next/prerender-manifest.json'
      )
      expect(manifest.dynamicRoutes['/products/[slug]'].fallback).toBe(false)
      expect(
        Object.keys(manifest.routes).filter((path) =>
          path.startsWith('/products/')
        )
      ).toEqual(['/products/allowed'])
    }
  })

  it.each(['document', 'navigation'])(
    'advertises closed parameters for a successful %s, including in dev',
    async (requestKind) => {
      const browser = await next.browser(
        requestKind === 'document' ? '/products/allowed' : '/open/allowed'
      )
      if (requestKind === 'navigation') {
        // This link disables prefetching, so the navigation exercises the live
        // RSC response in both dev and production.
        await browser.elementById('navigate-allowed').click()
      }
      expect(await browser.elementById('product-page').text()).toBe(
        'Allowed product page'
      )

      // The restriction belongs to the parameter, not the response root.
      // An eventual 404 alone also passed before the hint existed.
      expect(await getClosedSegments(browser)).toEqual(['[slug]'])
      expect(await hasClosedParamDescendants(browser)).toBe(true)
      await browser.close()
    }
  )

  it('does not mark an open dynamic route as closed', async () => {
    const browser = await next.browser('/open/allowed')
    expect(await browser.elementById('open-product-page').text()).toBe(
      'Open product page'
    )
    expect(await getClosedSegments(browser)).toEqual([])
    expect(await hasClosedParamDescendants(browser)).toBe(false)
    await browser.close()
  })

  it('marks every parameter in a closed tuple but not its static segments', async () => {
    const browser = await next.browser('/catalog/en/products/allowed/details')
    expect(await browser.elementById('catalog-page').text()).toBe(
      'Allowed catalog page'
    )
    expect(await getClosedSegments(browser)).toEqual(['[lang]', '[slug]'])
    expect(await hasClosedParamDescendants(browser)).toBe(true)
    await browser.close()
  })

  it('updates a shared parameter when navigating between open and closed siblings', async () => {
    const browser = await next.browser('/shared/allowed/open')
    expect(await browser.elementById('shared-open-page').text()).toBe(
      'Open sibling'
    )
    expect(await getClosedSegments(browser)).toEqual([])
    expect(await hasClosedParamDescendants(browser)).toBe(false)

    await browser.elementById('closed-sibling').click()
    expect(await browser.elementById('shared-closed-page').text()).toBe(
      'Closed sibling'
    )
    expect(await getClosedSegments(browser)).toEqual(['[slug]'])
    expect(await hasClosedParamDescendants(browser)).toBe(true)

    await browser.elementById('open-sibling').click()
    expect(await browser.elementById('shared-open-page').text()).toBe(
      'Open sibling'
    )
    expect(await getClosedSegments(browser)).toEqual([])
    // Returning to the open sibling must clear the inherited subtree hint.
    expect(await hasClosedParamDescendants(browser)).toBe(false)
    await browser.close()
  })

  // @force-gate prefetching
  it('does not reuse a prefetched 404 for an allowed parameter value', async () => {
    const response = await next.fetch('/products/allowed')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('id="product-page"')

    let act: ReturnType<typeof createRouterAct>
    const statuses: number[] = []
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page, {
          allowErrorStatusCodes: [404],
          includeAppShellRequests: true,
        })
        page.on('response', (response) => {
          if (
            response.request().headers().rsc &&
            new URL(response.url()).pathname === '/products/rejected'
          ) {
            statuses.push(response.status())
          }
        })
      },
    })

    await act(async () => {
      await browser
        .elementByCss('input[data-link-accordion="/products/rejected"]')
        .click()
    })
    expect(statuses).toContain(404)

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/products/allowed"]')
          .click()
      },
      { includes: 'Allowed product page' }
    )
    await act(async () => {
      await browser.elementByCss('a[href="/products/allowed"]').click()
    }, 'no-requests')

    expect(
      await browser.elementByCss('#product-page, #root-not-found').text()
    ).toBe('Allowed product page')
    expect(await browser.hasElementByCss('#root-not-found')).toBe(false)

    // A successful URL must still advertise that other parameter values may
    // not exist. Check the tree used by the navigation, not just the eventual
    // 404, which can also be recovered by a full document navigation.
    expect(await getClosedSegments(browser)).toEqual(['[slug]'])
    expect(await hasClosedParamDescendants(browser)).toBe(true)
  })

  // @force-gate prefetching
  it('does not reuse an allowed route for a parameter value that must 404', async () => {
    const allowedResponse = await next.fetch('/products/allowed')
    expect(allowedResponse.status).toBe(200)
    expect(await allowedResponse.text()).toContain('id="product-page"')

    // The document request establishes the expected route-level 404, rather
    // than the nested not-found boundary inside the products layout.
    const response = await next.fetch('/products/rejected')
    expect(response.status).toBe(404)
    const html = await response.text()
    expect(html).toContain('id="root-not-found"')
    expect(html).not.toContain('id="products-layout"')

    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page, {
          allowErrorStatusCodes: [404],
          includeAppShellRequests: true,
        })
      },
    })

    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/products/allowed"]')
          .click()
      },
      { includes: 'Allowed product page' }
    )

    // Learning /products/[slug] must not imply that every slug can match it,
    // even when none of the cached segments read slug.
    // This link opts out of prefetching. Optimistic navigation must not reuse
    // the allowed page without checking whether the new parameter can match.
    // A 404 may fall back to a document navigation, which router-act does not
    // support, so wait for the rendered result outside act.
    await browser.elementById('navigate-rejected').click()
    const navigationText = await browser
      .elementByCss('#product-page, #root-not-found, #nested-not-found')
      .text()

    await browser.refresh()
    expect(await browser.elementByCss('#root-not-found').text()).toBe(
      'Route not found'
    )
    expect(await browser.hasElementByCss('#products-layout')).toBe(false)
    expect(navigationText).toBe('Route not found')
  })
})

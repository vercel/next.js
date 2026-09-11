import cheerio from 'cheerio'
import { FileRef, nextTestSetup } from 'e2e-utils'
import type { PrerenderManifest } from 'next/dist/build'
import { join } from 'node:path'
import { createRouterAct } from 'router-act'

// @force-gate prefetching
describe.each([
  {
    name: 'dynamicParams = false',
    config: 'legacy.next.config.ts',
    page: 'legacy-page.tsx',
  },
  {
    name: 'paramMatching: not-found',
    config: 'next.config.ts',
    page: 'app/products/[slug]/page.tsx',
  },
])('segment cache closed params ($name)', ({ config, page }) => {
  const { next, isNextStart } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'app')),
      components: new FileRef(join(__dirname, 'components')),
      'next.config.ts': new FileRef(join(__dirname, config)),
      'app/products/[slug]/page.tsx': new FileRef(join(__dirname, page)),
    },
  })

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
  })

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

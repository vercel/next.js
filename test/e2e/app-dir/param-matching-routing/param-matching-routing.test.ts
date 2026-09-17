import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'

describe('param-matching-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function render(pathname: string, params: string) {
    const res = await next.fetch(pathname)
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#params').text()).toBe(params)
    expect($('#root-not-found, #nested-not-found').length).toBe(0)
    return $('#generation').text()
  }

  it.each([
    ['/en/catalog/t1/items/b1', 'en/t1/b1'],
    ['/es/catalog/t1/items/b1', 'es/t1/b1'],
    ['/en/catalog/t1/items/novel-bottom', 'en/t1/novel-bottom'],
    ['/en/catalog/novel-top/items/novel-bottom', 'en/novel-top/novel-bottom'],
    ['/es/catalog/novel-top/items/novel-bottom', 'es/novel-top/novel-bottom'],
    ['/en/on-demand/novel-top/items/novel-bottom', 'en/novel-top/novel-bottom'],
    ['/es/on-demand/other-top/items/other-bottom', 'es/other-top/other-bottom'],
    ['/en/dynamic/t1/first', 'en/t1/first'],
    ['/en/dynamic/t1/second', 'en/t1/second'],
    ['/es/dynamic/new-top/anything', 'es/new-top/anything'],
    ['/en/docs/getting-started/install', 'en/getting-started/install'],
    ['/es/docs/space%20here/install', 'es/space here/install'],
    ['/es/docs/space%20here/100%25', 'es/space here/100%'],
    ['/open/docs/space%20here/install', 'space here/install'],
    ['/open/docs/space%20here/100%25', 'space here/100%'],
  ])(
    'serves an admitted path through its real handler: %s',
    async (pathname, params) => {
      await render(pathname, params)
      await render(pathname, params)
    }
  )

  it('keeps simultaneous requests to different closed prefixes isolated', async () => {
    await Promise.all([
      render('/en/on-demand/concurrent/items/one', 'en/concurrent/one'),
      render('/es/on-demand/concurrent/items/one', 'es/concurrent/one'),
      render('/en/on-demand/concurrent/items/two', 'en/concurrent/two'),
    ])
  })

  it.each([
    '/fr/catalog/t1/items/b1',
    '/fr/catalog/new-top/items/new-bottom',
    '/fr/on-demand/new-top/items/new-bottom',
    '/fr/dynamic/new-top/anything',
    '/fr/docs/getting-started/install',
    '/en/closed/unlisted',
    '/en/catalog/t1/wrong-static-segment/b1',
  ])(
    'rejects %s without rendering the matched page or its nested 404',
    async (pathname) => {
      const res = await next.fetch(pathname, { redirect: 'manual' })
      expect(res.status).toBe(404)
      const $ = cheerio.load(await res.text())
      expect($('#root-not-found').text()).toBe('Route not found')
      expect(
        $(
          '#language-layout, #catalog-page, #closed-page, #docs-page, #nested-not-found'
        ).length
      ).toBe(0)
    }
  )

  it.each(['catalog', 'on-demand'])(
    'admits only the closed prefix for %s RSC and route discovery requests',
    async (route) => {
      for (const headers of [
        { RSC: '1' },
        {
          RSC: '1',
          'Next-Router-Prefetch': '1',
          'Next-Router-Segment-Prefetch': '/_tree',
        },
      ]) {
        const admitted = await next.fetch(
          `/en/${route}/rsc-top/items/rsc-bottom`,
          { headers }
        )
        expect(admitted.status).toBe(200)
        expect(admitted.headers.get('content-type')).toContain(
          'text/x-component'
        )
        await admitted.text()
        const rejected = await next.fetch(
          `/fr/${route}/rsc-top/items/rsc-bottom`,
          { headers }
        )
        expect(rejected.status).toBe(404)
        await rejected.text()
      }
    }
  )

  // @force-gate start
  it('handles an expected matcher miss without a cache-generation invariant error', async () => {
    const outputStart = next.cliOutput.length
    const res = await next.fetch('/fr/catalog/missing/items/missing')
    await res.text()
    expect(res.status).toBe(404)
    expect(next.cliOutput.slice(outputStart)).not.toMatch(/invariant:|Error:/i)
  })

  // @force-gate prod
  describe('revalidation', () => {
    it.each([
      ['/en/closed/known', 'en/known'],
      ['/es/catalog/t1/items/b1', 'es/t1/b1'],
    ])(
      'revalidates a seeded output without changing route admission: %s',
      async (pathname, params) => {
        const before = await render(pathname, params)
        expect(before).not.toBe('')
        expect(await render(pathname, params)).toBe(before)
        const res = await next.fetch('/revalidate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pathname }),
        })
        expect(res.status).toBe(200)
        await retry(async () => {
          expect(await render(pathname, params)).not.toBe(before)
        })
        const rejected = await next.fetch('/fr/closed/known')
        expect(rejected.status).toBe(404)
        await rejected.text()
      }
    )
  })

  // @force-gate prefetching
  describe('client route discovery', () => {
    it.each([
      ['/en/catalog/nav-top/items/nav-bottom', 'en/nav-top/nav-bottom'],
      ['/es/on-demand/nav-top/items/nav-bottom', 'es/nav-top/nav-bottom'],
    ])(
      'does not poison an admitted open suffix after prefetching a 404: %s',
      async (pathname, params) => {
        let act: ReturnType<typeof createRouterAct>
        const browser = await next.browser('/', {
          beforePageLoad(page) {
            act = createRouterAct(page, {
              allowErrorStatusCodes: [404],
              includeAppShellRequests: true,
            })
          },
        })
        await act(async () => {
          await browser
            .elementByCss(
              'input[data-link-accordion="/fr/catalog/nav-top/items/nav-bottom"]'
            )
            .click()
        })
        await act(
          async () => {
            await browser
              .elementByCss(`input[data-link-accordion="${pathname}"]`)
              .click()
          },
          { includes: 'Catalog' }
        )
        // The page can still have dynamic work after prefetch. Verify its final UI,
        // rather than requiring a particular number of navigation requests.
        await browser.elementByCss(`a[href="${pathname}"]`).click()
        expect(await browser.elementById('params').text()).toBe(params)
        await browser.refresh()
        expect(await browser.elementById('params').text()).toBe(params)
      }
    )

    it('does not reuse an admitted prefix when navigation must be a routing 404', async () => {
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
            .elementByCss(
              'input[data-link-accordion="/en/catalog/nav-top/items/nav-bottom"]'
            )
            .click()
        },
        { includes: 'Catalog' }
      )
      await browser.elementById('navigate-rejected').click()
      const navigationText = await browser
        .elementByCss('#root-not-found, #params, #nested-not-found')
        .text()
      await browser.refresh()
      expect(await browser.elementById('root-not-found').text()).toBe(
        'Route not found'
      )
      expect(navigationText).toBe('Route not found')
    })
  })
})

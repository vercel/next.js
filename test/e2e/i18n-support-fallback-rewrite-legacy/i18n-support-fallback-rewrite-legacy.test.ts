import url from 'url'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('i18n Support Fallback Rewrite Legacy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not rewrite for index page', async () => {
    for (const [pathname, query] of [
      ['/', {}],
      ['/en', {}],
      ['/fr', {}],
      ['/', { hello: 'world' }],
      ['/en', { hello: 'world' }],
      ['/fr', { hello: 'world' }],
    ] as const) {
      const asPath = url.format({ pathname, query })
      const browser = await next.browser(asPath)

      expect(JSON.parse(await browser.elementByCss('#router').text())).toEqual({
        index: true,
        pathname: '/',
        asPath: url.format({ pathname: '/', query }),
        query,
      })

      await retry(async () => {
        expect(
          JSON.parse(await browser.elementByCss('#router').text())
        ).toEqual({
          index: true,
          pathname: '/',
          asPath: url.format({ pathname: '/', query }),
          query,
        })
      })
    }
  })

  it('should not rewrite for dynamic page', async () => {
    for (const [pathname, query] of [
      ['/dynamic/first', {}],
      ['/en/dynamic/first', {}],
      ['/fr/dynamic/first', {}],
      ['/dynamic/first', { hello: 'world' }],
      ['/en/dynamic/first', { hello: 'world' }],
      ['/fr/dynamic/first', { hello: 'world' }],
    ] as const) {
      const asPath = url.format({ pathname, query })
      const browser = await next.browser(asPath)

      expect(JSON.parse(await browser.elementByCss('#router').text())).toEqual({
        dynamic: true,
        pathname: '/dynamic/[slug]',
        asPath: url.format({ pathname: '/dynamic/first', query }),
        query: {
          ...query,
          slug: 'first',
        },
      })

      await retry(async () => {
        expect(
          JSON.parse(await browser.elementByCss('#router').text())
        ).toEqual({
          dynamic: true,
          pathname: '/dynamic/[slug]',
          asPath: url.format({ pathname: '/dynamic/first', query }),
          query: {
            ...query,
            slug: 'first',
          },
        })
      })
    }
  })
})

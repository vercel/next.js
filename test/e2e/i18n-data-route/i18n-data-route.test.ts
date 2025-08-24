import { nextTestSetup } from 'e2e-utils'

const { i18n } = require('./next.config')

const pages = [
  { url: '/about', page: '/about', params: null },
  { url: '/blog/about', page: '/[slug]/about', params: { slug: 'blog' } },
]

function checkDataRoute(data: any, page: string) {
  expect(data).toHaveProperty('pageProps')
  expect(data.pageProps).toHaveProperty('page', page)
}

describe('i18n-data-route', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // This test skips deployment because env vars that are doubled underscore prefixed
    // are not supported.
    skipDeployment: true,
    env: {
      // Disable internal header stripping so we can test the invoke output.
      __NEXT_NO_STRIP_INTERNAL_HEADERS: '1',
    },
  })

  if (skipped) return

  describe('with locale prefix', () => {
    describe.each(i18n.locales)('/%s', (locale) => {
      const prefixed = pages.map((page) => ({
        ...page,
        url: `/${locale}${page.url}`,
      }))

      it.each(prefixed)(
        'should render $page via $url',
        async ({ url, page }) => {
          const $ = await next.render$(url)
          expect($('[data-page]').data('page')).toBe(page)
        }
      )

      it.each(prefixed)(
        'should serve data for $page',
        async ({ url, page, params }) => {
          url = `/_next/data/${next.buildId}${url}.json`
          if (params) {
            const query = new URLSearchParams(params)
            // Ensure the query is sorted so it's deterministic.
            query.sort()
            url += `?${query.toString()}`
          }

          const res = await next.fetch(url)
          expect(res.status).toBe(200)
          expect(res.headers.get('content-type')).toStartWith(
            'application/json'
          )
          const data = await res.json()
          checkDataRoute(data, page)
        }
      )
    })
  })

  describe('without locale prefix', () => {
    it.each(pages)('should render $page via $url', async ({ url, page }) => {
      const $ = await next.render$(url)
      expect($('[data-page]').data('page')).toBe(page)
    })

    it.each(pages)(
      'should serve data for $page',
      async ({ url, page, params }) => {
        url = `/_next/data/${next.buildId}/${i18n.defaultLocale}${url}.json`
        if (params) {
          const query = new URLSearchParams(params)
          // Ensure the query is sorted so it's deterministic.
          query.sort()
          url += `?${query.toString()}`
        }
        const res = await next.fetch(url)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toStartWith('application/json')
        const data = await res.json()
        checkDataRoute(data, page)
      }
    )
  })
})

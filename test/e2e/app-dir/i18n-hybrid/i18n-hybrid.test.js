// @ts-check

// @ts-ignore
import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

const { i18n } = require('./next.config')

const urls = [
  // Include the app page without a locale.
  ...(global.isNextDeploy
    ? []
    : [
        // TODO: enable for deploy mode when behavior is corrected
        {
          pathname: '/blog/first-post',
          expected: {
            pathname: '/blog/first-post',
            page: '/app/blog/[slug]/page.js',
          },
        },
      ]),

  // Include the app pages with locales (should not resolve).
  ...i18n.locales.map((locale) => ({
    pathname: `/${locale}/blog/first-post`,
    expected: null,
  })),

  // Include the pages page without a locale (should default to the default
  // locale).
  {
    pathname: '/about',
    expected: {
      pathname: `/${i18n.defaultLocale}/about`,
      page: '/pages/about.js',
    },
  },

  // Include the locale prefixed urls for the pages page (should resolve).
  ...i18n.locales.map((locale) => ({
    pathname: `/${locale}/about`,
    expected: {
      pathname: `/${locale}/about`,
      page: '/pages/about.js',
    },
  })),
]

describe('i18n-hybrid', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should warn about i18n in app dir', async () => {
    expect(next.cliOutput).toContain(
      'i18n configuration in next.config.js is unsupported in App Router.'
    )
  })

  it.each(urls.filter((url) => !url.expected))(
    'does not resolve $pathname',
    async (url) => {
      const res = await next.fetch(url.pathname, {
        redirect: 'manual',
      })

      expect(res.status).toBe(404)
    }
  )

  it.each(urls.filter((url) => url.expected))(
    'does resolve $pathname',
    async (url) => {
      const res = await next.fetch(url.pathname, {
        redirect: 'manual',
      })

      expect(res.status).toBe(200)

      const $ = cheerio.load(await res.text())
      const debug = JSON.parse($('#debug').text())
      expect(debug).toEqual(url.expected)
    }
  )
})

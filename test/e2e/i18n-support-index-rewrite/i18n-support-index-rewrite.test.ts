import assert from 'assert'
import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Custom routes i18n support index rewrite', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const locales = ['nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en']

  it('should rewrite index route correctly', async () => {
    for (const locale of locales) {
      const html = await next.render(`/${locale === 'en' ? '' : locale}`)
      const $ = cheerio.load(html)

      expect(JSON.parse($('#props').text())).toEqual({
        params: {
          slug: ['company', 'about-us'],
        },
        locale,
        hello: 'world',
      })
    }
  })

  it('should handle index rewrite on client correctly', async () => {
    for (const locale of locales) {
      const browser = await next.browser(
        `${locale === 'en' ? '' : `/${locale}`}/hello`
      )

      expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
        params: {
          slug: ['hello'],
        },
        locale,
        hello: 'world',
      })
      await browser.eval(`(function() {
        window.beforeNav = 1
        window.next.router.push('/')
      })()`)

      await retry(async () => {
        const html = await browser.eval('document.documentElement.innerHTML')
        const props = JSON.parse(cheerio.load(html)('#props').text())
        assert.deepEqual(props, {
          params: {
            slug: ['company', 'about-us'],
          },
          locale,
          hello: 'world',
        })
      })

      expect(await browser.eval('window.beforeNav')).toBe(1)
    }
  })
})

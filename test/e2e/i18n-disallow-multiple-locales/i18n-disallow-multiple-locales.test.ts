import { createNextDescribe } from 'e2e-utils'
import cheerio from 'cheerio'

const config = require('./next.config')

createNextDescribe(
  'i18n-disallow-multiple-locales',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should not accept multiple locales in path', async () => {
      // Verify the base case works for the default locale works.
      let res = await next.fetch('/', { redirect: 'manual' })

      expect(res.status).toBe(200)

      // Verify that we loaded the right page and the locale is correct.
      let html = await res.text()
      let $ = cheerio.load(html)
      expect($('#page').text()).toBe('index page')
      expect($('#router-locale').text()).toBe('en-US')

      for (const firstLocale of config.i18n.locales) {
        // Verify the base case works.
        res = await next.fetch(`/${firstLocale}`, {
          redirect: 'manual',
        })

        expect(res.status).toBe(200)

        // Verify that we loaded the right page and the locale is correct.
        html = await res.text()
        $ = cheerio.load(html)
        expect($('#page').text()).toBe('index page')
        expect($('#router-locale').text()).toBe(firstLocale)

        for (const secondLocale of config.i18n.locales) {
          // Ensure that the double locale does not work.
          res = await next.fetch(`/${firstLocale}/${secondLocale}`, {
            redirect: 'manual',
          })

          expect(res.status).toBe(404)
        }
      }
    })
  }
)

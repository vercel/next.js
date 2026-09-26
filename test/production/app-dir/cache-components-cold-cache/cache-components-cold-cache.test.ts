import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('cache-components-cold-cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['en', 'fr', 'de'])(
    'renders /%s after a cold cache miss',
    async (locale) => {
      const response = await next.fetch(`/${locale}`)
      expect(response.status).toBe(200)

      const $ = cheerio.load(await response.text())
      expect($('h1').text()).toBe(`Locale: ${locale}`)
      expect(next.cliOutput).not.toContain("key: '/[locale]', isFallback: true")
    }
  )
})

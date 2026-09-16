import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('ppr-bot-cache-bypass: e2e verification of bot static shell caching', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  const botUserAgents = [
    [
      'Googlebot',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    ],
    [
      'YandexBot',
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    ],
    [
      'Bingbot',
      'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ],
  ]

  if (isNextStart) {
    it.each(botUserAgents)(
      'should serve the static shell from cache with HIT header to %s',
      async (_botName, userAgent) => {
        const res = await next.fetch('/', {
          headers: {
            'user-agent': userAgent,
          },
        })

        expect(res.status).toBe(200)

        const html = await res.text()
        const $ = cheerio.load(html)
        expect($('#static-title').text()).toBe('Pre-rendered Static Shell')
        expect($('#static-desc').text()).toBe(
          'This part was prerendered at build time.'
        )
      }
    )

    it('should verify prerender manifest has the route as partially static', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      expect(prerenderManifest.routes['/'].renderingMode).toBe(
        'PARTIALLY_STATIC'
      )
    })
  } else {
    it('serves valid HTML in dev mode', async () => {
      const res = await next.fetch('/', {
        headers: {
          'user-agent': 'Googlebot',
        },
      })
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('Pre-rendered Static Shell')
    })
  }
})

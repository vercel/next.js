import { nextTestSetup } from 'e2e-utils'

describe('ppr-bot-cache: static shell and cache headers for search crawlers', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (!isNextStart) {
    it('skips non-production test runs', () => {})
    return
  }

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

  it('should mark the PPR route as partially static in prerender manifest', async () => {
    const prerenderManifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    expect(prerenderManifest.routes['/'].renderingMode).toBe('PARTIALLY_STATIC')
    expect(prerenderManifest.routes['/static-revalidate']).toBeDefined()
  })

  it.each(botUserAgents)(
    'should serve static shell from cache with HIT header for %s',
    async (_name, userAgent) => {
      const start = Date.now()
      const res = await next.fetch('/', {
        headers: {
          'user-agent': userAgent,
        },
      })
      const duration = Date.now() - start

      expect(res.status).toBe(200)
      expect(res.headers.get('x-nextjs-cache')).toBe('HIT')

      const html = await res.text()
      expect(html).toContain('Static Shell Header')
      expect(duration).toBeLessThan(1000)
    }
  )

  it.each(botUserAgents)(
    'should preserve Cache-Control s-maxage headers for %s on ISR route',
    async (_name, userAgent) => {
      const res = await next.fetch('/static-revalidate', {
        headers: {
          'user-agent': userAgent,
        },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('x-nextjs-cache')).toBe('HIT')

      const cacheControl = res.headers.get('cache-control') || ''
      expect(cacheControl).toContain('s-maxage=60')

      const html = await res.text()
      expect(html).toContain('Static ISR Page')
    }
  )
})

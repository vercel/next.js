import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'

describe('html-limited-bot-suspense', () => {
  const { next } = nextTestSetup({ files: __dirname })

  const bots = [
    ['Twitterbot', 'Twitterbot/1.0'],
    [
      'bingbot',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ],
  ]

  describe.each([
    ['large', '/', 500],
    ['small', '/small', 50],
  ] as const)('%s boundary', (_name, pathname, count) => {
    it.each(bots)(
      'renders completed content inline for %s',
      async (_bot, ua) => {
        const response = await next.fetch(pathname, {
          headers: { 'user-agent': ua },
        })
        expect(response.status).toBe(200)

        // Parse the raw response without executing React's reveal scripts.
        const $ = load(await response.text())
        expect($('main #items li')).toHaveLength(count)
        expect($('main #fallback')).toHaveLength(0)
        expect($('[hidden] #items')).toHaveLength(0)
      }
    )

    it('preserves streamed content for a browser', async () => {
      const response = await next.fetch(pathname, {
        headers: {
          'user-agent':
            'Mozilla/5.0 AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36',
        },
      })
      expect(response.status).toBe(200)

      const $ = load(await response.text())
      expect($('main #fallback')).toHaveLength(1)
      expect($('main #items')).toHaveLength(0)
      expect($('[hidden] #items li')).toHaveLength(count)
    })
  })
})

describe('custom bot configuration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.ts': `
        export default {
          cacheComponents: true,
          partialPrefetching: false,
          htmlLimitedBots: /FixtureBot/i,
        }
      `,
    },
  })

  describe.each([
    ['large', '/', 500],
    ['small', '/small', 50],
  ] as const)('%s boundary', (_name, pathname, count) => {
    it('renders inline for the configured bot, case-insensitively', async () => {
      const response = await next.fetch(pathname, {
        headers: { 'user-agent': 'fixturebot/1.0' },
      })
      expect(response.status).toBe(200)
      const $ = load(await response.text())
      expect($('main #items li')).toHaveLength(count)
      expect($('main #fallback')).toHaveLength(0)
      expect($('[hidden] #items')).toHaveLength(0)
    })

    it('streams for a default bot excluded by the custom pattern', async () => {
      const response = await next.fetch(pathname, {
        headers: { 'user-agent': 'Twitterbot/1.0' },
      })
      expect(response.status).toBe(200)
      const $ = load(await response.text())
      expect($('main #fallback')).toHaveLength(1)
      expect($('main #items')).toHaveLength(0)
      expect($('[hidden] #items li')).toHaveLength(count)
    })
  })
})

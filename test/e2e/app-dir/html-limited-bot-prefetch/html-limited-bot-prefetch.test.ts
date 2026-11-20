import { isNextDev, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

// The embedded runtime prefetch is only generated in production.
;(isNextDev ? describe.skip : describe).each([
  { name: 'default bots', partialPrefetching: true, customBots: false },
  { name: 'custom bots', partialPrefetching: true, customBots: true },
  {
    name: 'partial prefetching disabled',
    partialPrefetching: false,
    customBots: false,
  },
])('$name', ({ partialPrefetching, customBots }) => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `module.exports = {
        cacheComponents: true,
        partialPrefetching: ${partialPrefetching},
        ${customBots ? 'htmlLimitedBots: /CustomHtmlBot/i,' : ''}
      }`,
    },
  })

  describe.each(['/', '/static'])('%s', (pathname) => {
    it.each([
      ['browser', 'Mozilla/5.0'],
      ['DOM-capable bot', 'Googlebot'],
      ['HTML-limited bot', customBots ? 'CustomHtmlBot' : 'Twitterbot/1.0'],
      ...(customBots ? [['excluded default bot', 'Twitterbot/1.0']] : []),
    ])(
      'sends the expected page content copies to the %s',
      async (_, userAgent) => {
        const response = await next.fetch(pathname, {
          headers: { 'user-agent': userAgent },
        })
        expect(response.status).toBe(200)

        const html = await response.text()
        const $ = cheerio.load(html)
        expect($('#content').text()).toBe('BOT_PREFETCH_CONTENT_MARKER')
        if (pathname === '/') {
          expect($('#dynamic').text()).toBe('Dynamic content')
        }
        const isHtmlLimitedBot =
          userAgent === (customBots ? 'CustomHtmlBot' : 'Twitterbot/1.0')
        // Dynamic browser responses include an embedded runtime prefetch for
        // the client router. HTML-limited bots only need the HTML and hydration
        // payload, even when they bypass the prerendered shell.
        const expectedCopies =
          pathname === '/' && partialPrefetching && !isHtmlLimitedBot ? 3 : 2
        expect(html.split('BOT_PREFETCH_CONTENT_MARKER').length - 1).toBe(
          expectedCopies
        )

        if (isHtmlLimitedBot) {
          expect($('head title').text()).toBe('Bot prefetch regression')
          expect($('body title').length).toBe(0)
        }
      }
    )
  })
})

import { isNextDev, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
;(isNextDev ? describe.skip : describe)(
  'html-limited-bots-ppr with the default bot list',
  () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        'next.config.js': `
          module.exports = {
            cacheComponents: true,
          }
        `,
      },
    })

    it('should serve the partially prerendered shell to regular user agents', async () => {
      const res = await next.fetch('/partial')

      expect(res.status).toBe(200)
      if (!isNextDeploy) {
        expect(res.headers.get('x-nextjs-postponed')).toBe('1')
      }

      const $ = cheerio.load(await res.text())
      expect($('body title').text()).toBe('dynamic title')
      expect($('#dynamic-content').text()).toBe('dynamic content')
    })

    it('should serve a fully buffered dynamic render to a default HTML-limited bot', async () => {
      const res = await next.fetch('/partial?stream=delay', {
        headers: {
          'user-agent': 'Discordbot',
        },
      })

      expect(res.status).toBe(200)
      if (!isNextDeploy) {
        expect(res.headers.get('x-nextjs-postponed')).toBeNull()
      }

      const $ = cheerio.load(await res.text())
      expect($('head title').text()).toBe('dynamic title')
      expect($('body title').length).toBe(0)
      expect($('#dynamic-content').text()).toBe('dynamic content')
      expect($('#dynamic-fallback').length).toBe(0)
    })
  }
)

/* eslint-env jest */
import { join } from 'path'
import { killApp, findPort, launchApp, renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'

const appDir = join(__dirname, '../')

describe('App crossOrigin config', () => {
  let appPort
  let app

  it('should render correctly with assetPrefix: "/"', async () => {
    try {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)

      const html = await renderViaHTTP(appPort, '/')

      const $ = cheerio.load(html)

      // Only potential external (assetPrefix) <script /> and <link /> should have crossorigin attribute
      $(
        'script[src*="https://example.vercel.sh"], link[href*="https://example.vercel.sh"]'
      ).each((_, el) => {
        const crossOrigin = $(el).attr('crossorigin')
        expect(crossOrigin).toBe('use-credentials')
      })

      // Inline <script /> (including RSC payload) and <link /> should not have crossorigin attribute
      $('script:not([src]), link:not([href])').each((_, el) => {
        const crossOrigin = $(el).attr('crossorigin')
        expect(crossOrigin).toBeUndefined()
      })

      // Same origin <script /> and <link /> should not have crossorigin attribute either
      $('script[src^="/"], link[href^="/"]').each((_, el) => {
        const crossOrigin = $(el).attr('crossorigin')
        expect(crossOrigin).toBeUndefined()
      })
    } finally {
      killApp(app)
    }
  })
})

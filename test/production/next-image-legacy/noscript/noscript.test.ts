import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('Noscript Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('Noscript page source tests', () => {
    it('should use local API for noscript img#basic-image src attribute', async () => {
      const html = await next.render('/')
      const $ = cheerio.load(html)

      expect($('noscript > img#basic-image').attr('src')).toMatch(
        /^\/_next\/image/
      )
    })

    it('should use loader url for noscript img#image-with-loader src attribute', async () => {
      const html = await next.render('/')
      const $ = cheerio.load(html)

      expect($('noscript > img#image-with-loader').attr('src')).toMatch(
        /^https:\/\/customresolver.com/
      )
    })
  })
})

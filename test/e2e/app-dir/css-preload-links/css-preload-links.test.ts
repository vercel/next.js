import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('css-preload-links: emit preload link hints for critical stylesheet chunks', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should render preload link hint for stylesheet in initial HTML response', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    const html = await res.text()
    const $ = cheerio.load(html)

    const stylesheetLinks = $('link[rel="stylesheet"]')
    expect(stylesheetLinks.length).toBeGreaterThan(0)

    // Verify that every external stylesheet has a corresponding preload link
    stylesheetLinks.each((_, el) => {
      const href = $(el).attr('href')
      if (href && href.includes('/_next/static/css/')) {
        const matchingPreload = $('link[rel="preload"][as="style"]').filter(
          (__, preloadEl) => $(preloadEl).attr('href') === href
        )
        expect(matchingPreload.length).toBe(1)
      }
    })
  })

  if (isNextStart) {
    it('should hydrate correctly in browser', async () => {
      const browser = await next.browser('/')
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('CSS Preload Links Test')
    })
  }
})

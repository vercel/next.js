import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('disabled runtime JS', () => {
  const { next, isNextDev, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return

  it('should render the page', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/Hello World/)
  })

  it('should not have __NEXT_DATA__ script', async () => {
    const html = await next.render('/')

    const $ = cheerio.load(html)
    if (isNextStart) {
      expect($('script#__NEXT_DATA__').length).toBe(0)
    }
    if (isNextDev) {
      expect($('script#__NEXT_DATA__').length).toBe(1)
    }
  })

  if (isNextStart) {
    it('should not have scripts', async () => {
      const html = await next.render('/')
      const $ = cheerio.load(html)
      expect($('script[src]').length).toBe(0)
    })

    it('should not have preload links', async () => {
      const html = await next.render('/')
      const $ = cheerio.load(html)
      expect($('link[rel=preload]').length).toBe(0)
    })
  }

  if (isNextDev) {
    it('should have a script for each preload link', async () => {
      const html = await next.render('/')
      const $ = cheerio.load(html)
      const preloadLinks = $('link[rel=preload]')
      preloadLinks.each((idx, element) => {
        const url = $(element).attr('href')
        expect($(`script[src="${url}"]`).length).toBe(1)
      })
    })
  }
})

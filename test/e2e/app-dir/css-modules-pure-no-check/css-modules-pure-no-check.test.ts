import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

describe('css-modules-pure-no-check', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should apply styles correctly', async () => {
    const browser = await next.browser('/')

    const elementWithGlobalStyles = await browser
      .elementByCss('#my-div')
      .getComputedCss('font-weight')

    expect(elementWithGlobalStyles).toBe('700')
  })

  it('should have emitted a CSS file', async () => {
    const html = await next.render('/')
    const $html = cheerio.load(html)

    const cssLink = $html('link[rel="stylesheet"]')
    expect(cssLink.length).toBe(1)
    const cssHref = cssLink[0].attribs['href']

    const res = await next.fetch(cssHref)
    const cssContent = await res.text()
    const cssCode = cssContent.replace(/\/\*.*?\*\//g, '').trim()

    expect(cssCode).toInclude(`.global{font-weight:700}`)
    expect(cssCode).toInclude(
      `::view-transition-old(root){animation-duration:.3s}`
    )
  })
})

import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('css-minify', () => {
  const { next, isTurbopack } = nextTestSetup({ files: __dirname })

  it('should minify correctly by removing whitespace', async () => {
    const html = await next.render('/')
    const $ = cheerio.load(html)
    const href = $('link[rel="preload"]').attr('href')
    const cssRes = await next.fetch(href)
    const css = await cssRes.text()
    if (isTurbopack) {
      expect(css).toContain(
        '.a{--var-1:-50%;--var-2:-50%}.b{--var-1:0;--var-2:-50%}'
      )
    } else {
      expect(css).toMatchInlineSnapshot(
        `".a{--var-1:0;--var-2:0;--var-1:-50%;--var-2:-50%}.b{--var-1:0;--var-2:0;--var-2:-50%}"`
      )
    }
  })
})

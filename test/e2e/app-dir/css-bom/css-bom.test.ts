import { readFileSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('app dir - css with a UTF-8 BOM', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps the BOM in the fixture', () => {
    // Sanity check: the regression only happens when the CSS file literally
    // starts with the UTF-8 BOM bytes (EF BB BF).
    const bytes = readFileSync(join(__dirname, 'app', 'bom.css'))
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
  })

  it('compiles and serves a CSS file that starts with a BOM', async () => {
    const $ = await next.render$('/')

    expect($('p.bom').text()).toBe('hello world')

    const hrefs = $('link[rel="stylesheet"]')
      .map((_, el) => $(el).attr('href'))
      .get()
    const inlined = $('style')
      .map((_, el) => $(el).text())
      .get()

    const stylesheets = await Promise.all(
      hrefs.map(async (href) => (await next.fetch(href)).text())
    )

    expect([...stylesheets, ...inlined].join('\n')).toContain('.bom')
  })
})

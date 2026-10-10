import { readFileSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('app dir - css with a UTF-8 BOM', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.105.0', postcss: '8.5.28' },
    resolutions: { postcss: '8.5.28' },
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

  it('applies the first rule from every Sass module', async () => {
    const browser = await next.browser('/')

    expect(
      await browser.eval(
        "getComputedStyle(document.getElementById('sass-first')).color"
      )
    ).toBe('rgb(255, 0, 0)')
    expect(
      await browser.eval(
        "getComputedStyle(document.getElementById('sass-second')).color"
      )
    ).toBe('rgb(0, 128, 0)')
    expect(
      await browser.eval(
        "getComputedStyle(document.getElementById('sass-third')).color"
      )
    ).toBe('rgb(0, 0, 255)')
  })
})

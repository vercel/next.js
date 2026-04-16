import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('Custom Properties: Pass-Through IE11', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'cp-ie-11'),
  })

  it(`should've emitted a single CSS file`, async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    expect(cssSheet.length).toBe(1)

    const stylesheet = cssSheet.attr('href')!
    const cssContent = (await next.fetch(stylesheet).then((res) => res.text()))
      .replace(/\/\*.*?\*\//g, '')
      .trim()

    if (isTurbopack) {
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
    } else {
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
    }
  })
})

describe('Custom Properties: Pass-Through Modern', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'cp-modern'),
  })

  it(`should've emitted a single CSS file`, async () => {
    const $ = await next.render$('/')

    const cssSheet = $('link[rel="stylesheet"]')
    expect(cssSheet.length).toBe(1)

    const stylesheet = cssSheet.attr('href')!
    const cssContent = (await next.fetch(stylesheet).then((res) => res.text()))
      .replace(/\/\*.*?\*\//g, '')
      .trim()

    if (isTurbopack) {
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
    } else {
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`":root{--color:red}h1{color:var(--color)}"`)
    }
  })
})

// Invalid CSS that Lightning CSS in Turbopack interprets differently.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Inline Comments: Minify',
  () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures', 'inline-comments'),
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)

      const stylesheet = cssSheet.attr('href')!
      const cssContent = (
        await next.fetch(stylesheet).then((res) => res.text())
      )
        .replace(/\/\*.*?\*\//g, '')
        .trim()

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`"*{box-sizing:border-box}"`)
    })
  }
)

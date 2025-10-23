import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

function getClassNameRegex(className: string): RegExp {
  return new RegExp(`${className}`)
}

function hrefMatchesFontWithSizeAdjust(href: string) {
  if (process.env.IS_TURBOPACK_TEST) {
    expect(href).toMatch(
      // Turbopack includes the file hash
      /\/_next\/static\/media\/(.*)-s\.p\.(.*)\.woff2/
    )
  } else {
    expect(href).toMatch(/\/_next\/static\/media\/(.*)-s\.p\.woff2/)
  }
}

function hrefMatchesFontWithoutSizeAdjust(href: string) {
  if (process.env.IS_TURBOPACK_TEST) {
    expect(href).toMatch(
      // Turbopack includes the file hash
      /\/_next\/static\/media\/(.*)\.p\.(.*)\.woff2/
    )
  } else {
    expect(href).toMatch(/\/_next\/static\/media\/(.*)\.p\.woff2/)
  }
}

describe('next/font', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, `app/pages`)),
        components: new FileRef(join(__dirname, `app/components`)),
        fonts: new FileRef(join(__dirname, `app/fonts`)),
      },
      dependencies: {
        '@next/font': 'canary',
      },
      env: {
        NEXT_FONT_GOOGLE_MOCKED_RESPONSES: mockedGoogleFontResponses,
      },
    })
  })
  afterAll(() => next.destroy())

  if ((global as any).isNextDev) {
    it('should use production cache control for fonts', async () => {
      const $ = await next.render$('/')
      const link = $('[rel="preload"][as="font"]').attr('href')
      expect(link).toBeDefined()
      const res = await next.fetch(link)
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      )
    })
  }

  it('should not have deprecation warning', async () => {
    expect(next.cliOutput.toLowerCase()).not.toContain('deprecation')
  })

  describe('import values', () => {
    test('page with font', async () => {
      const html = await renderViaHTTP(next.url, '/with-fonts')
      const $ = cheerio.load(html)

      // _app.js
      expect(JSON.parse($('#app-open-sans').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        variable: expect.stringMatching(getClassNameRegex('variable')),
        style: {
          fontFamily: expect.stringMatching(
            /^'Open Sans', 'Open Sans Fallback'$/
          ),
          fontStyle: 'normal',
        },
      })

      // with-fonts.js
      expect(JSON.parse($('#with-fonts-open-sans').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        variable: expect.stringMatching(getClassNameRegex('variable')),
        style: {
          fontFamily: expect.stringMatching(
            /^'Open Sans', 'Open Sans Fallback'$/
          ),
          fontStyle: 'normal',
        },
      })

      // CompWithFonts.js
      expect(JSON.parse($('#comp-with-fonts-inter').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        style: {
          fontFamily: expect.stringMatching(/^'Inter', 'Inter Fallback'$/),
          fontWeight: 900,
          fontStyle: 'normal',
        },
      })
      expect(JSON.parse($('#comp-with-fonts-roboto').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        style: {
          fontFamily: expect.stringMatching(/^'Roboto', 'Roboto Fallback'$/),
          fontStyle: 'italic',
          fontWeight: 100,
        },
      })
    })

    test('page with local fonts', async () => {
      const html = await renderViaHTTP(next.url, '/with-local-fonts')
      const $ = cheerio.load(html)

      // _app.js
      expect(JSON.parse($('#app-open-sans').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        variable: expect.stringMatching(getClassNameRegex('variable')),
        style: {
          fontFamily: expect.stringMatching(
            /^'Open Sans', 'Open Sans Fallback'$/
          ),
          fontStyle: 'normal',
        },
      })

      // with-local-fonts.js
      expect(JSON.parse($('#first-local-font').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        style: {
          fontFamily: expect.stringMatching(
            /^'myFont1', 'myFont1 Fallback', system-ui$/
          ),
          fontStyle: 'italic',
          fontWeight: 100,
        },
      })
      expect(JSON.parse($('#second-local-font').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        variable: expect.stringMatching(getClassNameRegex('variable')),
        style: {
          fontFamily: expect.stringMatching(/^'myFont2', 'myFont2 Fallback'$/),
        },
      })
    })

    test('Variable font without weight range', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/variable-font-without-weight-range'
      )
      const $ = cheerio.load(html)

      expect(JSON.parse($('#nabla').text())).toEqual({
        className: expect.stringMatching(getClassNameRegex('className')),
        style: {
          fontFamily: expect.stringMatching(/^'Nabla', 'Nabla Fallback'$/),
          fontStyle: 'normal',
        },
      })
    })
  })

  describe('computed styles', () => {
    test('page with fonts', async () => {
      const browser = await webdriver(next.url, '/with-fonts')

      // _app.js
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#app-open-sans")).fontFamily'
        )
      ).toMatch(/^"Open Sans", "Open Sans Fallback"$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#app-open-sans")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#app-open-sans")).fontStyle'
        )
      ).toBe('normal')

      // with-fonts.js
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fonts-open-sans")).fontFamily'
        )
      ).toMatch(/^"Open Sans", "Open Sans Fallback"$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fonts-open-sans")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fonts-open-sans")).fontStyle'
        )
      ).toBe('normal')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fonts-open-sans-style")).fontWeight'
        )
      ).toBe('400')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fonts-open-sans-style")).fontStyle'
        )
      ).toBe('normal')

      // CompWithFonts.js
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#comp-with-fonts-inter")).fontFamily'
        )
      ).toMatch(/^Inter, "Inter Fallback"$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#comp-with-fonts-inter")).fontWeight'
        )
      ).toBe('900')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#comp-with-fonts-inter")).fontStyle'
        )
      ).toBe('normal')

      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#comp-with-fonts-roboto")).fontFamily'
        )
      ).toMatch(/^Roboto, "Roboto Fallback"$/)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#comp-with-fonts-roboto")).fontWeight'
        )
      ).toBe('100')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#comp-with-fonts-roboto")).fontStyle'
        )
      ).toBe('italic')
    })

    test('page using variables', async () => {
      const browser = await webdriver(next.url, '/variables')

      // Fira Code Variable
      const firaCodeRegex = /^"Fira Code", "Fira Code Fallback"$/
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-fira-code")).fontFamily'
        )
      ).toMatch(firaCodeRegex)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-fira-code")).fontFamily'
        )
      ).not.toMatch(firaCodeRegex)

      // Roboto 100 Italic
      const roboto100ItalicRegex = /^Roboto, "Roboto Fallback"$/
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-roboto-100-italic")).fontFamily'
        )
      ).toMatch(roboto100ItalicRegex)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-roboto-100-italic")).fontFamily'
        )
      ).not.toMatch(roboto100ItalicRegex)

      // Local font
      const localFontRegex = /^myFont, "myFont Fallback"$/
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-local-font")).fontFamily'
        )
      ).toMatch(localFontRegex)
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-local-font")).fontFamily'
        )
      ).not.toMatch(localFontRegex)
    })

    test('page using fallback fonts', async () => {
      const browser = await webdriver(next.url, '/with-fallback')

      // .className
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-classname")).fontFamily'
        )
      ).toMatch(/^"Open Sans", .*system-ui.*, Arial$/)

      // .style
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-style")).fontFamily'
        )
      ).toMatch(/^"Open Sans", .*system-ui.*, Arial$/)

      // .variable
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-variable")).fontFamily'
        )
      ).toMatch(/^"Open Sans", .*system-ui.*, Arial$/)
    })
  })

  describe('preload', () => {
    test('page with fonts', async () => {
      const html = await renderViaHTTP(next.url, '/with-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      expect($('link[as="font"]').length).toBe(2)
      const links = Array.from($('link[as="font"]')).sort((a, b) => {
        return a.attribs.href.localeCompare(b.attribs.href)
      })
      // From /_app
      const attributes = links[0].attribs
      expect(attributes.as).toBe('font')
      expect(attributes.crossorigin).toBe('anonymous')
      hrefMatchesFontWithSizeAdjust(attributes.href)
      expect(attributes.rel).toBe('preload')
      expect(attributes.type).toBe('font/woff2')
      expect(attributes['data-next-font']).toBe('size-adjust')

      const attributes2 = links[1].attribs
      expect(attributes2.as).toBe('font')
      expect(attributes2.crossorigin).toBe('anonymous')
      hrefMatchesFontWithSizeAdjust(attributes2.href)
      expect(attributes2.rel).toBe('preload')
      expect(attributes2.type).toBe('font/woff2')
      expect(attributes2['data-next-font']).toBe('size-adjust')
    })

    test('page without fonts', async () => {
      const html = await renderViaHTTP(next.url, '/without-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      // From _app
      expect($('link[as="font"]').length).toBe(1)

      const attributes = $('link[as="font"]').get(0).attribs
      expect(attributes.as).toBe('font')
      expect(attributes.crossorigin).toBe('anonymous')
      hrefMatchesFontWithSizeAdjust(attributes.href)
      expect(attributes.rel).toBe('preload')
      expect(attributes.type).toBe('font/woff2')
      expect(attributes['data-next-font']).toBe('size-adjust')
    })

    test('page with local fonts', async () => {
      const html = await renderViaHTTP(next.url, '/with-local-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      // Preload
      expect($('link[as="font"]').length).toBe(5)
      const hrefs = Array.from($('link[as="font"]'))
        .map((el) => el.attribs.href)
        .sort()
      for (const href of hrefs) {
        hrefMatchesFontWithSizeAdjust(href)
      }
      expect(hrefs.length).toBe(5)
    })

    test('google fonts with multiple weights/styles', async () => {
      const html = await renderViaHTTP(next.url, '/with-google-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      // Preload
      expect($('link[as="font"]').length).toBe(8)

      const hrefs = Array.from($('link[as="font"]'))
        .map((el) => el.attribs.href)
        .sort()

      for (const href of hrefs) {
        // Check that font file path is not too long for Windows systems.
        // Windows allows up to 256 characters but we check for 100 here
        // because if it's over 100 it's already way too much.
        expect(href.length).toBeLessThan(100)
        hrefMatchesFontWithSizeAdjust(href)
      }

      expect(hrefs.length).toBe(8)
    })

    test('font without preloadable subsets', async () => {
      const html = await renderViaHTTP(
        next.url,
        '/font-without-preloadable-subsets'
      )
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      // From _app
      expect($('link[as="font"]').length).toBe(1)
      const attributes = $('link[as="font"]').get(0).attribs

      expect(attributes.as).toBe('font')
      expect(attributes.crossorigin).toBe('anonymous')
      hrefMatchesFontWithSizeAdjust(attributes.href)
      expect(attributes.rel).toBe('preload')
      expect(attributes.type).toBe('font/woff2')
      expect(attributes['data-next-font']).toBe('size-adjust')
    })

    test('font without size adjust', async () => {
      const html = await renderViaHTTP(next.url, '/with-fallback')
      const $ = cheerio.load(html)
      const links = Array.from($('link[as="font"]'))
        .map((node) => node.attribs)
        .sort((a, b) => {
          return a.href.localeCompare(b.href)
        })
      const attributes = links[1]
      expect(attributes.as).toBe('font')
      expect(attributes.crossorigin).toBe('anonymous')
      hrefMatchesFontWithoutSizeAdjust(attributes.href)
      expect(attributes.rel).toBe('preload')
      expect(attributes.type).toBe('font/woff2')
      expect(attributes['data-next-font']).toBe('')

      const attributes2 = links[2]

      expect(attributes2.as).toBe('font')
      expect(attributes2.crossorigin).toBe('anonymous')
      hrefMatchesFontWithoutSizeAdjust(attributes2.href)
      expect(attributes2.rel).toBe('preload')
      expect(attributes2.type).toBe('font/woff2')
      expect(attributes2['data-next-font']).toBe('')
    })
  })

  describe('Fallback fontfaces', () => {
    describe('local', () => {
      test('Indie flower', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2 Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('103.26%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2 Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('51.94%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2 Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2 Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('94%')
      })

      test('Fraunces', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1 Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('84.71%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1 Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('22.09%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1 Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1 Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('115.45%')
      })

      test('Roboto multiple weights and styles', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("roboto Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('92.49%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("roboto Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('24.34%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("roboto Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("roboto Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('100.3%')
      })

      test('Roboto multiple weights and styles - variable 1', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1 Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('92.49%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1 Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('24.34%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1 Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1 Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('100.3%')
      })

      test('Roboto multiple weights and styles - variable 2', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2 Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('92.49%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2 Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('24.34%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2 Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2 Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('100.3%')
      })
    })

    describe('google', () => {
      test('Indie flower', async () => {
        const browser = await webdriver(next.url, '/with-google-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie Flower Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('103.05%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie Flower Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('51.84%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie Flower Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie Flower Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('94.19%')
      })

      test('Fraunces', async () => {
        const browser = await webdriver(next.url, '/with-google-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('84.71%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('22.09%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('115.45%')
      })
    })
  })

  describe('custom declarations', () => {
    test('local font with custom declarations', async () => {
      const browser = await webdriver(next.url, '/with-local-fonts')

      // Get all stylesheets
      const stylesheets = await browser.eval(`
        Array.from(document.styleSheets)
          .map(sheet => {
            try {
              return Array.from(sheet.cssRules || sheet.rules || [])
                .map(rule => rule.cssText)
                .join('\\n')
            } catch (e) {
              return ''
            }
          })
          .join('\\n')
      `)

      // Check that the custom declaration is included in the CSS
      expect(stylesheets).toContain('ascent-override: 90%')
    })
  })
})

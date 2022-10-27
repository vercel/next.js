import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

describe('@next/font/google', () => {
  let next: NextInstance

  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        components: new FileRef(join(__dirname, 'app/components')),
        fonts: new FileRef(join(__dirname, 'app/fonts')),
        'next.config.js': new FileRef(join(__dirname, 'app/next.config.js')),
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

  describe('import values', () => {
    test('page with font', async () => {
      const html = await renderViaHTTP(next.url, '/with-fonts')
      const $ = cheerio.load(html)

      // _app.js
      expect(JSON.parse($('#app-open-sans').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        variable: expect.stringMatching(/^__variable_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Open_Sans_.{6}', '__Open_Sans_Fallback_.{6}'$/
          ),
          fontStyle: 'normal',
        },
      })

      // with-fonts.js
      expect(JSON.parse($('#with-fonts-open-sans').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        variable: expect.stringMatching(/^__variable_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Open_Sans_.{6}', '__Open_Sans_Fallback_.{6}'$/
          ),
          fontStyle: 'normal',
        },
      })

      // CompWithFonts.js
      expect(JSON.parse($('#comp-with-fonts-inter').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Inter_.{6}', '__Inter_Fallback_.{6}'$/
          ),
          fontWeight: 900,
          fontStyle: 'normal',
        },
      })
      expect(JSON.parse($('#comp-with-fonts-roboto').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Roboto_.{6}', '__Roboto_Fallback_.{6}'$/
          ),
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
        className: expect.stringMatching(/__className_.{6}/),
        variable: expect.stringMatching(/__variable_.{6}/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Open_Sans_.{6}', '__Open_Sans_Fallback_.{6}'$/
          ),
          fontStyle: 'normal',
        },
      })

      // with-local-fonts.js
      expect(JSON.parse($('#first-local-font').text())).toEqual({
        className: expect.stringMatching(/__className_.{6}/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Fraunces_.{6}', system-ui, '__Fraunces_Fallback_.{6}'$/
          ),
          fontStyle: 'italic',
          fontWeight: 100,
        },
      })
      expect(JSON.parse($('#second-local-font').text())).toEqual({
        className: expect.stringMatching(/^__className_.{6}$/),
        variable: expect.stringMatching(/^__variable_.{6}$/),
        style: {
          fontFamily: expect.stringMatching(
            /^'__Indie_Flower_.{6}', '__Indie_Flower_Fallback_.{6}'$/
          ),
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
      ).toMatch(/^__Open_Sans_.{6}, __Open_Sans_Fallback_.{6}$/)
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
      ).toMatch(/^__Open_Sans_.{6}, __Open_Sans_Fallback_.{6}$/)
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
      ).toMatch(/^__Inter_.{6}, __Inter_Fallback_.{6}$/)
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
      ).toMatch(/^__Roboto_.{6}, __Roboto_Fallback_.{6}$/)
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
      const firaCodeRegex = /^__Fira_Code_.{6}, __Fira_Code_Fallback_.{6}$/
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
      const roboto100ItalicRegex = /^__Roboto_.{6}, __Roboto_Fallback_.{6}$/
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
      const localFontRegex = /^__Fraunces_.{6}, __Fraunces_Fallback_.{6}$/
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
      ).toMatch(
        /^__Open_Sans_.{6}, system-ui, Arial, __Open_Sans_Fallback_.{6}$/
      )

      // .style
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-style")).fontFamily'
        )
      ).toMatch(
        /^__Open_Sans_.{6}, system-ui, Arial, __Open_Sans_Fallback_.{6}$/
      )

      // .variable
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-variable")).fontFamily'
        )
      ).toMatch(
        /^__Open_Sans_.{6}, system-ui, Arial, __Open_Sans_Fallback_.{6}$/
      )
    })
  })

  describe('preload', () => {
    test('page with fonts', async () => {
      const html = await renderViaHTTP(next.url, '/with-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      expect($('link[as="font"]').length).toBe(2)
      // From /_app
      expect($('link[as="font"]').get(0).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/media/0812efcfaefec5ea.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/media/675c25f648fd6a30.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
    })

    test('page without fonts', async () => {
      const html = await renderViaHTTP(next.url, '/without-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      // From _app
      expect($('link[as="font"]').length).toBe(1)
      expect($('link[as="font"]').get(0).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/media/0812efcfaefec5ea.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
    })

    test('page with local fonts', async () => {
      const html = await renderViaHTTP(next.url, '/with-local-fonts')
      const $ = cheerio.load(html)

      // Preconnect
      expect($('link[rel="preconnect"]').length).toBe(0)

      // Preload
      expect($('link[as="font"]').length).toBe(2)
      // _app
      expect($('link[as="font"]').get(0).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/media/0812efcfaefec5ea.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
      // with-local-fonts
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/media/ab6fdae82d1a8d92.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
    })
  })

  describe('Fallback fontfaces', () => {
    describe('local', () => {
      test('Indie flower', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('103.26%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('51.94%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('94%')
      })

      test('Fraunces', async () => {
        const browser = await webdriver(next.url, '/with-local-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('84.71%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('22.09%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('115.45%')
      })
    })

    describe('google', () => {
      test('Indie flower', async () => {
        const browser = await webdriver(next.url, '/with-google-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('103.26%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('51.94%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('94%')
      })

      test('Fraunces', async () => {
        const browser = await webdriver(next.url, '/with-google-fonts')

        const ascentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).ascentOverride'
        )
        expect(ascentOverride).toBe('84.71%')

        const descentOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).descentOverride'
        )
        expect(descentOverride).toBe('22.09%')

        const lineGapOverride = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).lineGapOverride'
        )
        expect(lineGapOverride).toBe('0%')

        const sizeAdjust = await browser.eval(
          'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).sizeAdjust'
        )
        expect(sizeAdjust).toBe('115.45%')
      })
    })
  })
})

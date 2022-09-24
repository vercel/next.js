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
        className: '__className_f32d04',
        variable: '__variable_f32d04',
        style: {
          fontFamily: "'__Open_Sans_f32d04', '__open-sans-fallback_f32d04'",
          fontStyle: 'normal',
        },
      })

      // with-fonts.js
      expect(JSON.parse($('#with-fonts-open-sans').text())).toEqual({
        className: '__className_f32d04',
        variable: '__variable_f32d04',
        style: {
          fontFamily: "'__Open_Sans_f32d04', '__open-sans-fallback_f32d04'",
          fontStyle: 'normal',
        },
      })

      // CompWithFonts.js
      expect(JSON.parse($('#comp-with-fonts-inter').text())).toEqual({
        className: '__className_55e413',
        variable: '__variable_55e413',
        style: {
          fontFamily: "'__Inter_55e413', '__inter-fallback_55e413'",
          fontStyle: 'normal',
          fontWeight: 900,
        },
      })
      expect(JSON.parse($('#comp-with-fonts-roboto').text())).toEqual({
        className: '__className_29a3c6',
        variable: '__variable_29a3c6',
        style: {
          fontFamily: "'__Roboto_29a3c6', '__roboto-fallback_29a3c6'",
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
        className: '__className_f32d04',
        variable: '__variable_f32d04',
        style: {
          fontFamily: "'__Open_Sans_f32d04', '__open-sans-fallback_f32d04'",
          fontStyle: 'normal',
        },
      })

      // with-local-fonts.js
      expect(JSON.parse($('#first-local-font').text())).toEqual({
        className: '__className_410624',
        variable: '__variable_410624',
        style: {
          fontFamily: "'__my-font_410624'",
          fontStyle: 'italic',
          fontWeight: 100,
        },
      })
      expect(JSON.parse($('#second-local-font').text())).toEqual({
        className: '__className_3ff726',
        variable: '__variable_3ff726',
        style: {
          fontFamily: "'__my-other-font_3ff726'",
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
      ).toBe('__Open_Sans_f32d04, __open-sans-fallback_f32d04')
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
      ).toBe('__Open_Sans_f32d04, __open-sans-fallback_f32d04')
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
      ).toBe('__Inter_55e413, __inter-fallback_55e413')
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
      ).toBe('__Roboto_29a3c6, __roboto-fallback_29a3c6')
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
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-fira-code")).fontFamily'
        )
      ).toBe('__Fira_Code_8d0076, __fira-code-fallback_8d0076')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-fira-code")).fontFamily'
        )
      ).not.toBe('__Fira_Code_8d0076, __fira-code-fallback_8d0076')

      // Albert Sant Variable Italic
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-albert-sans-italic")).fontFamily'
        )
      ).toBe('__Albert_Sans_3a491b')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-albert-sans-italic")).fontFamily'
        )
      ).not.toBe('__Albert_Sans_3a491b')

      // Inter 900
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-inter-900")).fontFamily'
        )
      ).toBe('__Inter_09d70c, __inter-fallback_09d70c')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-inter-900")).fontFamily'
        )
      ).not.toBe('__Inter_09d70c, __inter-fallback_09d70c')

      // Roboto 100 Italic
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-roboto-100-italic")).fontFamily'
        )
      ).toBe('__Roboto_29a3c6, __roboto-fallback_29a3c6')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-roboto-100-italic")).fontFamily'
        )
      ).not.toBe('__Roboto_29a3c6, __roboto-fallback_29a3c6')
    })

    test('page using fallback fonts', async () => {
      const browser = await webdriver(next.url, '/with-fallback')

      // .className
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-classname")).fontFamily'
        )
      ).toBe(
        '__Open_Sans_f32d04, system-ui, Arial, __open-sans-fallback_f32d04'
      )

      // .style
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-style")).fontFamily'
        )
      ).toBe(
        '__Open_Sans_f32d04, system-ui, Arial, __open-sans-fallback_f32d04'
      )

      // .variable
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-variable")).fontFamily'
        )
      ).toBe(
        '__Open_Sans_f32d04, system-ui, Arial, __open-sans-fallback_f32d04'
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
        href: '/_next/static/media/4f3dcdf40b3ca86d.p.woff2',
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
        href: '/_next/static/media/7be88d77534e80fd.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
    })
  })
})

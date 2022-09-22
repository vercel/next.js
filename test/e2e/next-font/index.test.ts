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
        className: '__className_bbc724',
        variable: '__variable_bbc724',
        style: {
          fontFamily: "'__Open_Sans_bbc724', '__open-sans-fallback_bbc724'",
          fontStyle: 'normal',
        },
      })

      // with-fonts.js
      expect(JSON.parse($('#with-fonts-open-sans').text())).toEqual({
        className: '__className_bbc724',
        variable: '__variable_bbc724',
        style: {
          fontFamily: "'__Open_Sans_bbc724', '__open-sans-fallback_bbc724'",
          fontStyle: 'normal',
        },
      })

      // CompWithFonts.js
      expect(JSON.parse($('#comp-with-fonts-inter').text())).toEqual({
        className: '__className_17e98a',
        variable: '__variable_17e98a',
        style: {
          fontFamily: "'__Inter_17e98a', '__inter-fallback_17e98a'",
          fontStyle: 'normal',
          fontWeight: 900,
        },
      })
      expect(JSON.parse($('#comp-with-fonts-roboto').text())).toEqual({
        className: '__className_72084b',
        variable: '__variable_72084b',
        style: {
          fontFamily: "'__Roboto_72084b', '__roboto-fallback_72084b'",
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
        className: expect.any(String),
        variable: expect.any(String),
        style: {
          fontFamily: "'__Open_Sans_bbc724', '__open-sans-fallback_bbc724'",
          fontStyle: 'normal',
        },
      })

      // with-local-fonts.js
      expect(JSON.parse($('#first-local-font').text())).toEqual({
        className: expect.any(String),
        variable: expect.any(String),
        style: {
          fontFamily: "'__my-font_2cddd5'",
          fontStyle: 'italic',
          fontWeight: 100,
        },
      })
      expect(JSON.parse($('#second-local-font').text())).toEqual({
        className: expect.any(String),
        variable: expect.any(String),
        style: {
          fontFamily: "'__my-other-font_0a2813'",
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
      ).toBe('__Open_Sans_bbc724, __open-sans-fallback_bbc724')
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
      ).toBe('__Open_Sans_bbc724, __open-sans-fallback_bbc724')
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
      ).toBe('__Inter_17e98a, __inter-fallback_17e98a')
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
      ).toBe('__Roboto_72084b, __roboto-fallback_72084b')
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
      ).toBe('__Fira_Code_a1dc08, __fira-code-fallback_a1dc08')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-fira-code")).fontFamily'
        )
      ).not.toBe('__Fira_Code_a1dc08, __fira-code-fallback_a1dc08')

      // Albert Sant Variable Italic
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-albert-sans-italic")).fontFamily'
        )
      ).toBe('__Albert_Sans_2b85d2')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-albert-sans-italic")).fontFamily'
        )
      ).not.toBe('__Albert_Sans_2b85d2')

      // Inter 900
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-inter-900")).fontFamily'
        )
      ).toBe('__Inter_ea3712, __inter-fallback_ea3712')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-inter-900")).fontFamily'
        )
      ).not.toBe('__Inter_ea3712, __inter-fallback_ea3712')

      // Roboto 100 Italic
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#variables-roboto-100-italic")).fontFamily'
        )
      ).toBe('__Roboto_72084b, __roboto-fallback_72084b')
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#without-variables-roboto-100-italic")).fontFamily'
        )
      ).not.toBe('__Roboto_72084b')
    })

    test('page using fallback fonts', async () => {
      const browser = await webdriver(next.url, '/with-fallback')

      // .className
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-classname")).fontFamily'
        )
      ).toBe(
        '__Open_Sans_bbc724, system-ui, Arial, __open-sans-fallback_bbc724'
      )

      // .style
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-style")).fontFamily'
        )
      ).toBe(
        '__Open_Sans_bbc724, system-ui, Arial, __open-sans-fallback_bbc724'
      )

      // .variable
      expect(
        await browser.eval(
          'getComputedStyle(document.querySelector("#with-fallback-fonts-variable")).fontFamily'
        )
      ).toBe(
        '__Open_Sans_bbc724, system-ui, Arial, __open-sans-fallback_bbc724'
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
        href: '/_next/static/fonts/0812efcfaefec5ea.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/fonts/4f3dcdf40b3ca86d.p.woff2',
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
        href: '/_next/static/fonts/0812efcfaefec5ea.p.woff2',
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
        href: '/_next/static/fonts/0812efcfaefec5ea.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
      // with-local-fonts
      expect($('link[as="font"]').get(1).attribs).toEqual({
        as: 'font',
        crossorigin: 'anonymous',
        href: '/_next/static/fonts/7be88d77534e80fd.p.woff2',
        rel: 'preload',
        type: 'font/woff2',
      })
    })
  })
})

import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP, shouldRunTurboDevTest } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'

const mockedGoogleFontResponses = require.resolve(
  './google-font-mocked-responses.js'
)

function getClassNameRegex(className: string): RegExp {
  // Turbopack uses a different format for its css modules than webpack-based Next.js
  return shouldRunTurboDevTest()
    ? new RegExp(`^${className}__.*__.{8}$`) // e.g. `className__inter_c6e282f1__a8cc5613`
    : new RegExp(`^__${className}_.{6}$`) // e.g. `__className_a8cc56`
}

describe('next/font', () => {
  for (const fixture of ['app', 'app-old']) {
    describe(fixture, () => {
      // Turbopack only support `next/font` as `@next/font` is going to be removed in the next major version.
      if (process.env.TURBOPACK && fixture === 'app-old') {
        return
      }
      let next: NextInstance

      if ((global as any).isNextDeploy) {
        it('should skip next deploy for now', () => {})
        return
      }

      beforeAll(async () => {
        next = await createNext({
          files: {
            pages: new FileRef(join(__dirname, `${fixture}/pages`)),
            components: new FileRef(join(__dirname, `${fixture}/components`)),
            fonts: new FileRef(join(__dirname, `${fixture}/fonts`)),
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
          const html = await next.render('/')
          console.log({ html })
          const $ = await next.render$('/')
          const link = $('[rel="preload"][as="font"]').attr('href')
          expect(link).toBeDefined()
          const res = await next.fetch(link)
          expect(res.headers.get('cache-control')).toBe(
            'public, max-age=31536000, immutable'
          )
        })
      }

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
                /^'__Open_Sans_.{6}', '__Open_Sans_Fallback_.{6}'$/
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
                /^'__Open_Sans_.{6}', '__Open_Sans_Fallback_.{6}'$/
              ),
              fontStyle: 'normal',
            },
          })

          // CompWithFonts.js
          expect(JSON.parse($('#comp-with-fonts-inter').text())).toEqual({
            className: expect.stringMatching(getClassNameRegex('className')),
            style: {
              fontFamily: expect.stringMatching(
                /^'__Inter_.{6}', '__Inter_Fallback_.{6}'$/
              ),
              fontWeight: 900,
              fontStyle: 'normal',
            },
          })
          expect(JSON.parse($('#comp-with-fonts-roboto').text())).toEqual({
            className: expect.stringMatching(getClassNameRegex('className')),
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
            className: expect.stringMatching(getClassNameRegex('className')),
            variable: expect.stringMatching(getClassNameRegex('variable')),
            style: {
              fontFamily: expect.stringMatching(
                /^'__Open_Sans_.{6}', '__Open_Sans_Fallback_.{6}'$/
              ),
              fontStyle: 'normal',
            },
          })

          // with-local-fonts.js
          expect(JSON.parse($('#first-local-font').text())).toEqual({
            className: expect.stringMatching(getClassNameRegex('className')),
            style: {
              fontFamily: expect.stringMatching(
                /^'__myFont1_.{6}', '__myFont1_Fallback_.{6}', system-ui$/
              ),
              fontStyle: 'italic',
              fontWeight: 100,
            },
          })
          expect(JSON.parse($('#second-local-font').text())).toEqual({
            className: expect.stringMatching(getClassNameRegex('className')),
            variable: expect.stringMatching(getClassNameRegex('variable')),
            style: {
              fontFamily: expect.stringMatching(
                /^'__myFont2_.{6}', '__myFont2_Fallback_.{6}'$/
              ),
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
              fontFamily: expect.stringMatching(
                /^'__Nabla_.{6}', '__Nabla_Fallback_.{6}'$/
              ),
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
          const localFontRegex = /^__myFont_.{6}, __myFont_Fallback_.{6}$/
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
          ).toMatch(/^__Open_Sans_.{6}, system-ui, Arial$/)

          // .style
          expect(
            await browser.eval(
              'getComputedStyle(document.querySelector("#with-fallback-fonts-style")).fontFamily'
            )
          ).toMatch(/^__Open_Sans_.{6}, system-ui, Arial$/)

          // .variable
          expect(
            await browser.eval(
              'getComputedStyle(document.querySelector("#with-fallback-fonts-variable")).fontFamily'
            )
          ).toMatch(/^__Open_Sans_.{6}, system-ui, Arial$/)
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
          expect(links[0].attribs).toEqual({
            as: 'font',
            crossorigin: 'anonymous',
            href: '/_next/static/media/0812efcfaefec5ea-s.p.woff2',
            rel: 'preload',
            type: 'font/woff2',
            'data-next-font': 'size-adjust',
          })
          expect(links[1].attribs).toEqual({
            as: 'font',
            crossorigin: 'anonymous',
            href: '/_next/static/media/675c25f648fd6a30-s.p.woff2',
            rel: 'preload',
            type: 'font/woff2',
            'data-next-font': 'size-adjust',
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
            href: '/_next/static/media/0812efcfaefec5ea-s.p.woff2',
            rel: 'preload',
            type: 'font/woff2',
            'data-next-font': 'size-adjust',
          })
        })

        test('page with local fonts', async () => {
          const html = await renderViaHTTP(next.url, '/with-local-fonts')
          const $ = cheerio.load(html)

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          // Preload
          expect($('link[as="font"]').length).toBe(5)
          expect(
            Array.from($('link[as="font"]'))
              .map((el) => el.attribs.href)
              .sort()
          ).toEqual([
            '/_next/static/media/02205c9944024f15-s.p.woff2',
            '/_next/static/media/0812efcfaefec5ea-s.p.woff2',
            '/_next/static/media/1deec1af325840fd-s.p.woff2',
            '/_next/static/media/ab6fdae82d1a8d92-s.p.woff2',
            '/_next/static/media/d55edb6f37902ebf-s.p.woff2',
          ])
        })

        test('google fonts with multiple weights/styles', async () => {
          const html = await renderViaHTTP(next.url, '/with-google-fonts')
          const $ = cheerio.load(html)

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          // Preload
          expect($('link[as="font"]').length).toBe(8)

          expect(
            Array.from($('link[as="font"]'))
              .map((el) => el.attribs.href)
              .sort()
          ).toEqual([
            '/_next/static/media/0812efcfaefec5ea-s.p.woff2',
            '/_next/static/media/4f3dcdf40b3ca86d-s.p.woff2',
            '/_next/static/media/560a6db6ac485cb1-s.p.woff2',
            '/_next/static/media/686d1702f12625fe-s.p.woff2',
            '/_next/static/media/86d92167ff02c708-s.p.woff2',
            '/_next/static/media/9ac01b894b856187-s.p.woff2',
            '/_next/static/media/c9baea324111137d-s.p.woff2',
            '/_next/static/media/fb68b4558e2a718e-s.p.woff2',
          ])
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
          expect($('link[as="font"]').get(0).attribs).toEqual({
            as: 'font',
            crossorigin: 'anonymous',
            href: '/_next/static/media/0812efcfaefec5ea-s.p.woff2',
            rel: 'preload',
            type: 'font/woff2',
            'data-next-font': 'size-adjust',
          })
        })

        test('font without size adjust', async () => {
          const html = await renderViaHTTP(next.url, '/with-fallback')
          const $ = cheerio.load(html)
          const links = Array.from($('link[as="font"]')).sort((a, b) => {
            return a.attribs.href.localeCompare(b.attribs.href)
          })
          expect(links[1].attribs).toEqual({
            as: 'font',
            crossorigin: 'anonymous',
            href: '/_next/static/media/0812efcfaefec5ea.p.woff2',
            rel: 'preload',
            type: 'font/woff2',
            'data-next-font': '',
          })

          expect(links[2].attribs).toEqual({
            as: 'font',
            crossorigin: 'anonymous',
            href: '/_next/static/media/ab6fdae82d1a8d92.p.woff2',
            rel: 'preload',
            type: 'font/woff2',
            'data-next-font': '',
          })
        })
      })

      describe('Fallback fontfaces', () => {
        describe('local', () => {
          test('Indie flower', async () => {
            const browser = await webdriver(next.url, '/with-local-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('103.26%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('51.94%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont2_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('94%')
          })

          test('Fraunces', async () => {
            const browser = await webdriver(next.url, '/with-local-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('84.71%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('22.09%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("myFont1_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('115.45%')
          })

          test('Roboto multiple weights and styles', async () => {
            const browser = await webdriver(next.url, '/with-local-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("roboto_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('92.49%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("roboto_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('24.34%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("roboto_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("roboto_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('100.3%')
          })

          test('Roboto multiple weights and styles - variable 1', async () => {
            const browser = await webdriver(next.url, '/with-local-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('92.49%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('24.34%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar1_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('100.3%')
          })

          test('Roboto multiple weights and styles - variable 2', async () => {
            const browser = await webdriver(next.url, '/with-local-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('92.49%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('24.34%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("robotoVar2_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('100.3%')
          })
        })

        describe('google', () => {
          test('Indie flower', async () => {
            const browser = await webdriver(next.url, '/with-google-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('101.1%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('50.85%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Indie_Flower_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('96.02%')
          })

          test('Fraunces', async () => {
            const browser = await webdriver(next.url, '/with-google-fonts')

            const ascentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).ascentOverride'
            )
            expect(ascentOverride).toBe('84.29%')

            const descentOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).descentOverride'
            )
            expect(descentOverride).toBe('21.98%')

            const lineGapOverride = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).lineGapOverride'
            )
            expect(lineGapOverride).toBe('0%')

            const sizeAdjust = await browser.eval(
              'Array.from(document.fonts.values()).find(font => font.family.includes("Fraunces_Fallback")).sizeAdjust'
            )
            expect(sizeAdjust).toBe('116.03%')
          })
        })
      })
    })
  }
})

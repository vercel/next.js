import { nextTestSetup, FileRef } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource } from 'next-test-utils'
import { join } from 'path'
import cheerio from 'cheerio'

// TODO-APP: due to a current implementation limitation, we don't have proper tree
// shaking when across the server/client boundaries (e.g. all referenced client
// modules by a server module will be included in the bundle even it's not actually
// used by that server module).
// This is a known limitation of flight-client-entry-plugin and we will improve
// this in the future.

const getAttrs = (elems: Cheerio) =>
  Array.from(elems)
    .map((elem) => elem.attribs)
    // There is something weord that causes different machines to have different order of things
    // My machine behaves differently to CI
    .sort((a, b) => (a.href < b.href ? -1 : 1))

describe('app dir - next/font', () => {
  describe('app dir - next-font', () => {
    const {
      next,
      isNextDev: isDev,
      skipped,
    } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        fonts: new FileRef(join(__dirname, 'fonts')),
        node_modules: new FileRef(join(__dirname, 'node_modules')),
        'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
      },
      dependencies: {
        '@next/font': 'canary',
      },
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    describe('import values', () => {
      it('should have correct values at /', async () => {
        const $ = await next.render$('/')

        // layout
        expect(JSON.parse($('#root-layout').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          variable: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_variable$/ : /^__variable_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font1', 'font1 Fallback'$/),
          },
        })
        // page
        expect(JSON.parse($('#root-page').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          variable: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_variable$/ : /^__variable_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font2', 'font2 Fallback'$/),
          },
        })
        // Comp
        expect(JSON.parse($('#root-comp').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font3', 'font3 Fallback'$/),
            fontStyle: 'italic',
            fontWeight: 900,
          },
        })
      })

      it('should have correct values at /client', async () => {
        const $ = await next.render$('/client')

        // root layout
        expect(JSON.parse($('#root-layout').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          variable: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_variable$/ : /^__variable_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font1', 'font1 Fallback'$/),
          },
        })

        // layout
        expect(JSON.parse($('#client-layout').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font4', 'font4 Fallback'$/),
            fontWeight: 100,
          },
        })
        // page
        expect(JSON.parse($('#client-page').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font5', 'font5 Fallback'$/),
            fontStyle: 'italic',
          },
        })
        // Comp
        expect(JSON.parse($('#client-comp').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font6', 'font6 Fallback'$/),
          },
        })
      })

      it('should transform code in node_modules', async () => {
        const $ = await next.render$('/third-party')
        expect(JSON.parse($('#third-party-page').text())).toEqual({
          className: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_className$/ : /^__className_.*/
          ),
          style: {
            fontFamily: expect.stringMatching(/^'font1', 'font1 Fallback'$/),
          },
          variable: expect.stringMatching(
            process.env.IS_TURBOPACK_TEST ? /.*_variable$/ : /^__variable_.*/
          ),
        })
      })
    })

    describe('computed styles', () => {
      it('should have correct styles at /', async () => {
        const browser = await next.browser('/')

        // layout
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-layout")).fontFamily'
          )
        ).toMatch(/^font1, "font1 Fallback"$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-layout")).fontWeight'
          )
        ).toBe('400')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-layout")).fontStyle'
          )
        ).toBe('normal')

        // page
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-page")).fontFamily'
          )
        ).toMatch(/^font2, "font2 Fallback"$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-page")).fontWeight'
          )
        ).toBe('400')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-page")).fontStyle'
          )
        ).toBe('normal')

        // Comp
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-comp")).fontFamily'
          )
        ).toMatch(/^font3, "font3 Fallback"$$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-comp")).fontWeight'
          )
        ).toBe('900')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-comp")).fontStyle'
          )
        ).toBe('italic')
      })

      it('should have correct styles at /client', async () => {
        const browser = await next.browser('/client')

        // root layout
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-layout")).fontFamily'
          )
        ).toMatch(/^font1, "font1 Fallback"$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-layout")).fontWeight'
          )
        ).toBe('400')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#root-layout")).fontStyle'
          )
        ).toBe('normal')

        // layout
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-layout")).fontFamily'
          )
        ).toMatch(/^font4, "font4 Fallback"$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-layout")).fontWeight'
          )
        ).toBe('100')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-layout")).fontStyle'
          )
        ).toBe('normal')

        // page
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-page")).fontFamily'
          )
        ).toMatch(/^font5, "font5 Fallback"$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-page")).fontWeight'
          )
        ).toBe('400')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-page")).fontStyle'
          )
        ).toBe('italic')

        // Comp
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-comp")).fontFamily'
          )
        ).toMatch(/^font6, "font6 Fallback"$$/)
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-comp")).fontWeight'
          )
        ).toBe('400')
        expect(
          await browser.eval(
            'getComputedStyle(document.querySelector("#client-comp")).fontStyle'
          )
        ).toBe('normal')
      })
    })

    if (!isDev) {
      describe('preload', () => {
        it('should preload correctly with server components', async () => {
          const result = await next.fetch('/')
          const headers = result.headers

          const html = await result.text()
          const $ = cheerio.load(html)

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          const fontPreloadlinksInHeaders = headers
            .get('link')
            .split(', ')
            .filter((link) => link.match(/as=.*font/))
          expect(fontPreloadlinksInHeaders.length).toBeGreaterThan(2)
          for (const link of fontPreloadlinksInHeaders) {
            expect(link).toMatch(/<[^>]*?_next[^>]*?\.woff2>/)
            expect(link).toMatch(/rel=.*preload/)
            expect(link).toMatch(/crossorigin=""/)
          }

          const items = getAttrs($('link[as="font"]'))

          // We expect the font preloads to be in headers exclusively
          expect(items.length).toBe(0)
        })

        it('should preload correctly with client components', async () => {
          const $ = await next.render$('/client')

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          const links = getAttrs($('link[as="font"]'))

          for (const link of links) {
            expect(link.as).toBe('font')
            expect(link.crossorigin).toBe('')
            if (process.env.IS_TURBOPACK_TEST) {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.(.*)\.woff2/
              )
            } else {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.woff2/
              )
            }
            expect(link.rel).toBe('preload')
            expect(link.type).toBe('font/woff2')
          }
        })

        it('should preload correctly with layout using fonts', async () => {
          const $ = await next.render$('/layout-with-fonts')

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          const links = getAttrs($('link[as="font"]'))

          for (const link of links) {
            expect(link.as).toBe('font')
            expect(link.crossorigin).toBe('')
            if (process.env.IS_TURBOPACK_TEST) {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.(.*)\.woff2/
              )
            } else {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.woff2/
              )
            }
            expect(link.rel).toBe('preload')
            expect(link.type).toBe('font/woff2')
          }
        })

        it('should preload correctly with template using fonts', async () => {
          const $ = await next.render$('/template-with-fonts')

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          const links = getAttrs($('link[as="font"]'))

          for (const link of links) {
            expect(link.as).toBe('font')
            expect(link.crossorigin).toBe('')
            if (process.env.IS_TURBOPACK_TEST) {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.(.*)\.woff2/
              )
            } else {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.woff2/
              )
            }
            expect(link.rel).toBe('preload')
            expect(link.type).toBe('font/woff2')
          }
        })

        it('should preload correctly with page using fonts', async () => {
          const $ = await next.render$('/page-with-fonts')

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)

          const links = getAttrs($('link[as="font"]'))

          for (const link of links) {
            expect(link.as).toBe('font')
            expect(link.crossorigin).toBe('')
            if (process.env.IS_TURBOPACK_TEST) {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.(.*)\.woff2/
              )
            } else {
              expect(link.href).toMatch(
                /\/_next\/static\/media\/(.*)-s.p.woff2/
              )
            }
            expect(link.rel).toBe('preload')
            expect(link.type).toBe('font/woff2')
          }
        })
      })

      describe('preconnect', () => {
        it.each([['page'], ['layout'], ['component'], ['template']])(
          'should add preconnect when preloading is disabled in %s',
          async (type: string) => {
            const $ = await next.render$(`/preconnect-${type}`)

            // Preconnect
            expect($('link[rel="preconnect"]').length).toBe(1)
            expect($('link[rel="preconnect"]').get(0).attribs).toEqual({
              crossorigin: '',
              href: '/',
              rel: 'preconnect',
            })
            // Preload
            expect($('link[as="font"]').length).toBe(0)
          }
        )

        it('should not preconnect when css is used but no fonts', async () => {
          const $ = await next.render$('/no-preconnect')

          // Preconnect
          expect($('link[rel="preconnect"]').length).toBe(0)
          // Preload
          expect(getAttrs($('link[as="font"]'))).toEqual([])
        })
      })
    }

    describe('navigation', () => {
      it('should not have duplicate preload tags on navigation', async () => {
        const browser = await next.browser('/navigation')

        // Before navigation, root layout imports the font
        const preloadBeforeNavigation =
          await browser.elementsByCss('link[as="font"]')
        expect(preloadBeforeNavigation.length).toBe(1)
        const href = await preloadBeforeNavigation[0].getAttribute('href')
        if (process.env.IS_TURBOPACK_TEST) {
          expect(href).toMatch(/\/_next\/static\/media\/(.*)-s\.p\.(.*)\.woff2/)
        } else {
          expect(href).toMatch(/\/_next\/static\/media\/(.*)-s\.p\.woff2/)
        }

        // Navigate to a page that also imports that font
        await browser.elementByCss('a').click()
        await browser.waitForElementByCss('#page-with-same-font')

        // After navigating
        const preloadAfterNavigation =
          await browser.elementsByCss('link[as="font"]')
        expect(preloadAfterNavigation.length).toBe(1)

        const href2 = await preloadAfterNavigation[0].getAttribute('href')
        if (process.env.IS_TURBOPACK_TEST) {
          expect(href2).toMatch(
            /\/_next\/static\/media\/(.*)-s\.p\.(.*)\.woff2/
          )
        } else {
          expect(href2).toMatch(/\/_next\/static\/media\/(.*)-s\.p\.woff2/)
        }
      })
    })

    if (isDev) {
      describe('Dev errors', () => {
        it('should recover on font loader error', async () => {
          const browser = await next.browser('/')
          const font1Content = await next.readFile('fonts/index.js')

          // Break file
          await next.patchFile(
            'fonts/index.js',
            font1Content.replace(
              './font1_roboto.woff2',
              './does-not-exist.woff2'
            )
          )
          await assertHasRedbox(browser)
          expect(await getRedboxSource(browser)).toInclude(
            "Can't resolve './does-not-exist.woff2'"
          )

          // Fix file
          await next.patchFile('fonts/index.js', font1Content)
          await browser.waitForElementByCss('#root-page')
        })
      })
    }
  })
})

import { createNextDescribe, FileRef } from 'e2e-utils'
import { getRedboxSource, hasRedbox } from 'next-test-utils'
import { join } from 'path'

// TODO-APP: due to a current implementation limitation, we don't have proper tree
// shaking when across the server/client boundaries (e.g. all referenced client
// modules by a server module will be included in the bundle even it's not actually
// used by that server module).
// This is a known limitation of flight-client-entry-plugin and we will improve
// this in the future.
// TODO-APP: After the above issue is fixed, we should change this function to
// be strictly equal instead: `expect(arr).toEqual(expected)`.
function containObjects(arr: any[], expected: any[]) {
  for (const o of expected) {
    expect(arr).toContainEqual(o)
  }
}

const getAttrs = (elems: Cheerio) =>
  Array.from(elems)
    .map((elem) => elem.attribs)
    // There is something weord that causes different machines to have different order of things
    // My machine behaves differently to CI
    .sort((a, b) => (a.href < b.href ? -1 : 1))

describe('app dir - next/font', () => {
  for (const fixture of ['app', 'app-old']) {
    describe(fixture, () => {
      // Turbopack only support `next/font` as `@next/font` is going to be removed in the next major version.
      if (process.env.TURBOPACK && fixture === 'app-old') {
        return
      }

      createNextDescribe(
        'app dir - next-font',
        {
          files: {
            app: new FileRef(join(__dirname, fixture)),
            fonts: new FileRef(join(__dirname, 'fonts')),
            node_modules: new FileRef(join(__dirname, 'node_modules')),
            'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
          },
          dependencies: {
            '@next/font': 'canary',
          },
          skipDeployment: true,
        },
        ({ next, isNextDev: isDev }) => {
          describe('import values', () => {
            it('should have correct values at /', async () => {
              const $ = await next.render$('/')

              // layout
              expect(JSON.parse($('#root-layout').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                variable: expect.stringMatching(/^__variable_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font1_.{6}'$/),
                },
              })
              // page
              expect(JSON.parse($('#root-page').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                variable: expect.stringMatching(/^__variable_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font2_.{6}'$/),
                },
              })
              // Comp
              expect(JSON.parse($('#root-comp').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font3_.{6}'$/),
                  fontStyle: 'italic',
                  fontWeight: 900,
                },
              })
            })

            it('should have correct values at /client', async () => {
              const $ = await next.render$('/client')

              // root layout
              expect(JSON.parse($('#root-layout').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                variable: expect.stringMatching(/^__variable_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font1_.{6}'$/),
                },
              })

              // layout
              expect(JSON.parse($('#client-layout').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font4_.{6}'$/),
                  fontWeight: 100,
                },
              })
              // page
              expect(JSON.parse($('#client-page').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font5_.{6}'$/),
                  fontStyle: 'italic',
                },
              })
              // Comp
              expect(JSON.parse($('#client-comp').text())).toEqual({
                className: expect.stringMatching(/^__className_.{6}$/),
                style: {
                  fontFamily: expect.stringMatching(/^'__font6_.{6}'$/),
                },
              })
            })

            it('should transform code in node_modules', async () => {
              const $ = await next.render$('/third-party')
              expect(JSON.parse($('#third-party-page').text())).toEqual({
                className: '__className_3953ad',
                style: {
                  fontFamily: "'__font1_3953ad'",
                },
                variable: '__variable_3953ad',
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
              ).toMatch(/^__font1_.{6}$/)
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
              ).toMatch(/^__font2_.{6}$/)
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
              ).toMatch(/^__font3_.{6}$/)
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
              ).toMatch(/^__font1_.{6}$/)
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
              ).toMatch(/^__font4_.{6}$/)
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
              ).toMatch(/^__font5_.{6}$/)
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
              ).toMatch(/^__font6_.{6}$/)
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
                const $ = await next.render$('/')

                // Preconnect
                expect($('link[rel="preconnect"]').length).toBe(0)

                // From root layout
                containObjects(getAttrs($('link[as="font"]')), [
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/b2104791981359ae-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/b61859a50be14c53-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/e9b9dc0d8ba35f48-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                ])
              })

              it('should preload correctly with client components', async () => {
                const $ = await next.render$('/client')

                // Preconnect
                expect($('link[rel="preconnect"]').length).toBe(0)

                // From root layout
                containObjects(getAttrs($('link[as="font"]')), [
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/e1053f04babc7571-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/e9b9dc0d8ba35f48-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/feab2c68f2a8e9a4-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                ])
              })

              it('should preload correctly with layout using fonts', async () => {
                const $ = await next.render$('/layout-with-fonts')

                // Preconnect
                expect($('link[rel="preconnect"]').length).toBe(0)

                // From root layout
                containObjects(getAttrs($('link[as="font"]')), [
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/75c5faeeb9c86969-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/e9b9dc0d8ba35f48-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                ])
              })

              it('should preload correctly with page using fonts', async () => {
                const $ = await next.render$('/page-with-fonts')

                // Preconnect
                expect($('link[rel="preconnect"]').length).toBe(0)

                // From root layout
                containObjects(getAttrs($('link[as="font"]')), [
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/568e4c6d8123c4d6-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                  {
                    as: 'font',
                    crossorigin: '',
                    href: '/_next/static/media/e9b9dc0d8ba35f48-s.p.woff2',
                    rel: 'preload',
                    type: 'font/woff2',
                  },
                ])
              })
            })

            describe('preconnect', () => {
              it.each([['page'], ['layout'], ['component']])(
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
              const preloadBeforeNavigation = await browser.elementsByCss(
                'link[as="font"]'
              )
              expect(preloadBeforeNavigation.length).toBe(1)
              expect(
                await preloadBeforeNavigation[0].getAttribute('href')
              ).toBe('/_next/static/media/c287665b44f047d4-s.p.woff2')

              // Navigate to a page that also imports that font
              await browser.elementByCss('a').click()
              await browser.waitForElementByCss('#page-with-same-font')

              // After navigating
              const preloadAfterNavigation = await browser.elementsByCss(
                'link[as="font"]'
              )
              expect(preloadAfterNavigation.length).toBe(1)
              expect(await preloadAfterNavigation[0].getAttribute('href')).toBe(
                '/_next/static/media/c287665b44f047d4-s.p.woff2'
              )
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
                    './font1.woff2',
                    './does-not-exist.woff2'
                  )
                )
                expect(await hasRedbox(browser)).toBeTrue()
                expect(await getRedboxSource(browser)).toInclude(
                  "Can't resolve './does-not-exist.woff2'"
                )

                // Fix file
                await next.patchFile('fonts/index.js', font1Content)
                await browser.waitForElementByCss('#root-page')
              })
            })
          }
        }
      )
    })
  }
})

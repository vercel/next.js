/* eslint-env jest */
import cheerio from 'cheerio'
import { remove } from 'fs-extra'
import {
  findPort,
  File,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  fetchViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

describe('CSS Support', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('CSS Compilation and Prefixing', () => {
        const appDir = join(fixturesDir, 'compilation-and-prefixing')
        const nextConfig = new File(join(appDir, 'next.config.js'))
        const packageJson = new File(join(appDir, 'package.json'))

        beforeAll(async () => {
          await remove(join(appDir, '.next'))
          packageJson.write(`{"browserslist": ["chrome 60"]}`)
        })

        afterAll(async () => {
          packageJson.delete()
        })

        describe.each([true, false])(
          `useLightnincsss(%s)`,
          (useLightningcss) => {
            let appPort
            let app
            beforeAll(async () => {
              nextConfig.write(
                `
const config = require('../next.config.js');
module.exports = {
  ...config,
  experimental: {
    useLightningcss: ${useLightningcss}
  }
}`
              )

              const { code } = await nextBuild(appDir)
              if (code !== 0) {
                throw new Error('Build failed')
              }
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            afterAll(async () => {
              nextConfig.delete()
            })

            it(`should've compiled and prefixed`, async () => {
              const content = await renderViaHTTP(appPort, '/')
              const $ = cheerio.load(content)

              const cssSheet = $('link[rel="stylesheet"]')
              expect(cssSheet.length).toBe(1)

              const stylesheetUrl = cssSheet.attr('href')

              const cssContent = await fetchViaHTTP(
                appPort,
                stylesheetUrl
              ).then((res) => res.text())

              const cssContentWithoutSourceMap = cssContent
                .replace(/\/\*.*?\*\/\n?/g, '')
                .trim()

              if (process.env.IS_TURBOPACK_TEST && useLightningcss) {
                expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
                  `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px,0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
                )
              } else if (process.env.IS_TURBOPACK_TEST && !useLightningcss) {
                expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
                  `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0px,0px)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
                )
              } else if (useLightningcss) {
                expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
                  `"@media (min-width:480px) and (not (min-width:768px)){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:.8}"`
                )
              } else {
                expect(cssContentWithoutSourceMap).toMatchInlineSnapshot(
                  `"@media (min-width:480px) and (max-width:767px){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:80%}"`
                )
              }

              // Contains a source map
              expect(cssContent).toMatch(
                /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
              )

              const sourceMapUrl =
                /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//.exec(cssContent)[1]
              const actualSourceMapUrl = stylesheetUrl.replace(
                /[^/]+$/,
                sourceMapUrl
              )

              const sourceMapContent = await fetchViaHTTP(
                appPort,
                actualSourceMapUrl
              ).then((res) => res.text())
              const sourceMapContentParsed = JSON.parse(sourceMapContent)
              // Ensure it doesn't have a specific path in the snapshot.
              delete sourceMapContentParsed.file
              delete sourceMapContentParsed.sources

              if (process.env.IS_TURBOPACK_TEST) {
                // Turbopack always uses lightningcss
                expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                 {
                   "mappings": "AAAA,qDACE,2BAKF,0DAIA,kDAIA,uCAIA",
                   "names": [],
                   "sourcesContent": [
                     "@media (480px <= width < 768px) {
                   ::placeholder {
                     color: green;
                   }
                 }

                 .flex-parsing {
                   flex: 0 0 calc(50% - var(--vertical-gutter));
                 }

                 .transform-parsing {
                   transform: translate3d(0px, 0px);
                 }

                 .css-grid-shorthand {
                   grid-column: span 2;
                 }

                 .g-docs-sidenav .filter::-webkit-input-placeholder {
                   opacity: 80%;
                 }
                 ",
                   ],
                   "version": 3,
                 }
                `)
              } else if (useLightningcss) {
                expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                 {
                   "ignoreList": [],
                   "mappings": "AAAA,qDACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,UACF",
                   "names": [],
                   "sourceRoot": "",
                   "sourcesContent": [
                     "@media (min-width: 480px) and (not (min-width: 768px)) {
                   ::placeholder {
                     color: green;
                   }
                 }

                 .flex-parsing {
                   flex: 0 0 calc(50% - var(--vertical-gutter));
                 }

                 .transform-parsing {
                   transform: translate3d(0px, 0px);
                 }

                 .css-grid-shorthand {
                   grid-column: span 2;
                 }

                 .g-docs-sidenav .filter::-webkit-input-placeholder {
                   opacity: .8;
                 }

                 ",
                   ],
                   "version": 3,
                 }
                `)
              } else {
                expect(sourceMapContentParsed).toMatchInlineSnapshot(`
                  {
                    "ignoreList": [],
                    "mappings": "AAAA,+CACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,WACF",
                    "names": [],
                    "sourceRoot": "",
                    "sourcesContent": [
                      "@media (480px <= width < 768px) {
                    ::placeholder {
                      color: green;
                    }
                  }

                  .flex-parsing {
                    flex: 0 0 calc(50% - var(--vertical-gutter));
                  }

                  .transform-parsing {
                    transform: translate3d(0px, 0px);
                  }

                  .css-grid-shorthand {
                    grid-column: span 2;
                  }

                  .g-docs-sidenav .filter::-webkit-input-placeholder {
                    opacity: 80%;
                  }
                  ",
                    ],
                    "version": 3,
                  }
                `)
              }

              const inlineStyle = $('style')
              expect(inlineStyle.length).toBe(1)
              const inlineCssContent = inlineStyle
                .html()
                .replace(
                  /media-query-test.jsx-[a-f0-9]{16}/g,
                  'media-query-test.jsx-HASH'
                )
              if (process.env.IS_TURBOPACK_TEST && useLightningcss) {
                expect(inlineCssContent).toMatchInlineSnapshot(
                  `".media-query-test.jsx-HASH{color:#00f}@media (max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
                )
              } else if (process.env.IS_TURBOPACK_TEST && !useLightningcss) {
                expect(inlineCssContent).toMatchInlineSnapshot(
                  `".media-query-test.jsx-HASH{color:#00f}@media (max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
                )
              } else if (useLightningcss) {
                expect(inlineCssContent).toMatchInlineSnapshot(
                  `".media-query-test.jsx-HASH{color:blue}@media(max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
                )
              } else {
                expect(inlineCssContent).toMatchInlineSnapshot(
                  `".media-query-test.jsx-HASH{color:blue}@media(max-width:400px){.media-query-test.jsx-HASH{color:orange}}"`
                )
              }
            })
          }
        )
      })

      describe('React Lifecyce Order (production)', () => {
        const appDir = join(fixturesDir, 'transition-react')
        const nextConfig = new File(join(appDir, 'next.config.js'))
        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })

        describe.each([true, false])(
          `useLightnincsss(%s)`,
          (useLightningcss) => {
            beforeAll(async () => {
              nextConfig.write(
                `
const config = require('../next.config.js');
module.exports = {
  ...config,
  experimental: {
    useLightningcss: ${useLightningcss}
  }
}`
              )
            })

            let appPort
            let app
            beforeAll(async () => {
              const { code } = await nextBuild(appDir)
              if (code !== 0) {
                throw new Error('Build failed')
              }
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            it('should have the correct color on mount after navigation', async () => {
              let browser
              try {
                browser = await webdriver(appPort, '/')

                // Navigate to other:
                await browser.waitForElementByCss('#link-other').click()
                const text = await browser
                  .waitForElementByCss('#red-title')
                  .text()
                expect(text).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
              } finally {
                if (browser) {
                  await browser.close()
                }
              }
            })
          }
        )
      })

      describe('Has CSS in computed styles in Production', () => {
        const appDir = join(fixturesDir, 'multi-page')
        const nextConfig = new File(join(appDir, 'next.config.js'))

        describe.each([true, false])(
          `useLightnincsss(%s)`,
          (useLightningcss) => {
            beforeAll(async () => {
              nextConfig.write(
                `
const config = require('../next.config.js');
module.exports = {
  ...config,
  experimental: {
    useLightningcss: ${useLightningcss}
  }
}`
              )
            })

            let appPort
            let app
            beforeAll(async () => {
              await remove(join(appDir, '.next'))
              const { code } = await nextBuild(appDir)
              if (code !== 0) {
                throw new Error('Build failed')
              }
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            it('should have CSS for page', async () => {
              const browser = await webdriver(appPort, '/page2')

              const currentColor = await browser.eval(
                `window.getComputedStyle(document.querySelector('.blue-text')).color`
              )
              expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
            })

            it(`should've preloaded the CSS file and injected it in <head>`, async () => {
              const content = await renderViaHTTP(appPort, '/page2')
              const $ = cheerio.load(content)

              const cssPreload = $('link[rel="preload"][as="style"]')
              expect(cssPreload.length).toBe(1)
              expect(cssPreload.attr('href')).toMatch(
                /^\/_next\/static\/.*\.css$/
              )

              const cssSheet = $('link[rel="stylesheet"]')
              expect(cssSheet.length).toBe(1)
              expect(cssSheet.attr('href')).toMatch(
                /^\/_next\/static\/.*\.css$/
              )

              /* ensure CSS preloaded first */
              const allPreloads = [].slice.call($('link[rel="preload"]'))
              const styleIndexes = allPreloads.flatMap((p, i) =>
                p.attribs.as === 'style' ? i : []
              )
              expect(styleIndexes).toEqual([0])
            })
          }
        )
      })

      describe('Good CSS Import from node_modules', () => {
        const appDir = join(fixturesDir, 'npm-import')
        const nextConfig = new File(join(appDir, 'next.config.js'))

        describe.each([true, false])(
          `useLightnincsss(%s)`,
          (useLightningcss) => {
            beforeAll(async () => {
              nextConfig.write(
                `
const config = require('../next.config.js');
module.exports = {
  ...config,
  experimental: {
    useLightningcss: ${useLightningcss}
  }
}`
              )
            })

            let appPort
            let app
            beforeAll(async () => {
              await remove(join(appDir, '.next'))
              const { code } = await nextBuild(appDir)
              if (code !== 0) {
                throw new Error('Build failed')
              }
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            it(`should've emitted a single CSS file`, async () => {
              const content = await renderViaHTTP(appPort, '/')
              const $ = cheerio.load(content)

              const cssSheet = $('link[rel="stylesheet"]')
              expect(cssSheet.length).toBe(1)

              const stylesheet = cssSheet.attr('href')

              const cssContent = (
                await fetchViaHTTP(appPort, stylesheet).then((res) =>
                  res.text()
                )
              )
                .replace(/\/\*.*?\*\/\n?/g, '')
                .trim()

              expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()).toMatch(
                /nprogress/
              )
            })
          }
        )
      })

      describe('Good Nested CSS Import from node_modules', () => {
        const appDir = join(fixturesDir, 'npm-import-nested')
        const nextConfig = new File(join(appDir, 'next.config.js'))

        describe.each([true, false])(
          `useLightnincsss(%s)`,
          (useLightningcss) => {
            beforeAll(async () => {
              nextConfig.write(
                `
const config = require('../next.config.js');
module.exports = {
  ...config,
  experimental: {
    useLightningcss: ${useLightningcss}
  }
}`
              )
            })

            let appPort
            let app
            beforeAll(async () => {
              await remove(join(appDir, '.next'))
              const { code } = await nextBuild(appDir)
              if (code !== 0) {
                throw new Error('Build failed')
              }
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            it(`should've emitted a single CSS file`, async () => {
              const content = await renderViaHTTP(appPort, '/')
              const $ = cheerio.load(content)

              const cssSheet = $('link[rel="stylesheet"]')
              expect(cssSheet.length).toBe(1)

              const stylesheet = cssSheet.attr('href')

              const cssContent = (
                await fetchViaHTTP(appPort, stylesheet).then((res) =>
                  res.text()
                )
              )
                .replace(/\/\*.*?\*\/\n?/g, '')
                .trim()

              if (process.env.IS_TURBOPACK_TEST && useLightningcss) {
                expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
                  .toMatchInlineSnapshot(`
                 ".other{color:#00f}
                 .test{color:red}"
                `)
              } else if (process.env.IS_TURBOPACK_TEST && !useLightningcss) {
                expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
                  .toMatchInlineSnapshot(`
                 ".other{color:#00f}
                 .test{color:red}"
                `)
              } else if (useLightningcss) {
                expect(
                  cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()
                ).toMatchInlineSnapshot(`".other{color:#00f}.test{color:red}"`)
              } else {
                expect(
                  cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim()
                ).toMatchInlineSnapshot(`".other{color:blue}.test{color:red}"`)
              }
            })
          }
        )
      })
    }
  )
})

// https://github.com/vercel/next.js/issues/15468
describe('CSS Property Ordering', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const appDir = join(fixturesDir, 'next-issue-15468')
      const nextConfig = new File(join(appDir, 'next.config.js'))

      describe.each([true, false])(`useLightnincsss(%s)`, (useLightningcss) => {
        beforeAll(async () => {
          nextConfig.write(
            `
const config = require('../next.config.js');
module.exports = {
  ...config,
  experimental: {
    useLightningcss: ${useLightningcss}
  }
}`
          )
        })

        let appPort
        let app
        beforeAll(async () => {
          await remove(join(appDir, '.next'))
          const { code } = await nextBuild(appDir)
          if (code !== 0) {
            throw new Error('Build failed')
          }
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(async () => {
          await killApp(app)
        })

        it('should have the border width (property ordering)', async () => {
          const browser = await webdriver(appPort, '/')

          const width1 = await browser.eval(
            `window.getComputedStyle(document.querySelector('.test1')).borderWidth`
          )
          expect(width1).toMatchInlineSnapshot(`"0px"`)

          const width2 = await browser.eval(
            `window.getComputedStyle(document.querySelector('.test2')).borderWidth`
          )
          expect(width2).toMatchInlineSnapshot(`"5px"`)
        })
      })
    }
  )
})

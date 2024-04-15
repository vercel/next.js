/* eslint-env jest */
import cheerio from 'cheerio'
import { readdir, readFile, remove } from 'fs-extra'
import {
  findPort,
  File,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
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

            afterAll(async () => {
              nextConfig.delete()
            })

            it('should compile successfully', async () => {
              const { code, stdout } = await nextBuild(appDir, [], {
                stdout: true,
              })
              expect(code).toBe(0)
              expect(stdout).toMatch(/Compiled successfully/)
            })

            it(`should've compiled and prefixed`, async () => {
              const cssFolder = join(appDir, '.next/static/css')

              const files = await readdir(cssFolder)
              const cssFiles = files.filter((f) => /\.css$/.test(f))

              expect(cssFiles.length).toBe(1)
              const cssContent = await readFile(
                join(cssFolder, cssFiles[0]),
                'utf8'
              )
              expect(
                cssContent.replace(/\/\*.*?\*\//g, '').trim()
              ).toMatchSnapshot()

              // Contains a source map
              expect(cssContent).toMatch(
                /\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//
              )
            })

            it(`should've emitted a source map`, async () => {
              const cssFolder = join(appDir, '.next/static/css')

              const files = await readdir(cssFolder)
              const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

              expect(cssMapFiles.length).toBe(1)
              const cssMapContent = (
                await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
              ).trim()

              const { version, mappings, sourcesContent } =
                JSON.parse(cssMapContent)
              expect({ version, mappings, sourcesContent }).toMatchSnapshot()
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
            let code
            let stdout
            beforeAll(async () => {
              ;({ code, stdout } = await nextBuild(appDir, [], {
                stdout: true,
              }))
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            it('should have compiled successfully', () => {
              expect(code).toBe(0)
              expect(stdout).toMatch(/Compiled successfully/)
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
            let stdout
            let code
            beforeAll(async () => {
              await remove(join(appDir, '.next'))
              ;({ code, stdout } = await nextBuild(appDir, [], {
                stdout: true,
              }))
              appPort = await findPort()
              app = await nextStart(appDir, appPort)
            })
            afterAll(async () => {
              await killApp(app)
            })

            it('should have compiled successfully', () => {
              expect(code).toBe(0)
              expect(stdout).toMatch(/Compiled successfully/)
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
                /^\/_next\/static\/css\/.*\.css$/
              )

              const cssSheet = $('link[rel="stylesheet"]')
              expect(cssSheet.length).toBe(1)
              expect(cssSheet.attr('href')).toMatch(
                /^\/_next\/static\/css\/.*\.css$/
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

            beforeAll(async () => {
              await remove(join(appDir, '.next'))
            })

            it('should compile successfully', async () => {
              const { code, stdout } = await nextBuild(appDir, [], {
                stdout: true,
              })
              expect(code).toBe(0)
              expect(stdout).toMatch(/Compiled successfully/)
            })

            it(`should've emitted a single CSS file`, async () => {
              const cssFolder = join(appDir, '.next/static/css')

              const files = await readdir(cssFolder)
              const cssFiles = files.filter((f) => /\.css$/.test(f))

              expect(cssFiles.length).toBe(1)
              const cssContent = await readFile(
                join(cssFolder, cssFiles[0]),
                'utf8'
              )
              expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
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

            beforeAll(async () => {
              await remove(join(appDir, '.next'))
            })

            it('should compile successfully', async () => {
              const { code, stdout } = await nextBuild(appDir, [], {
                stdout: true,
              })
              expect(code).toBe(0)
              expect(stdout).toMatch(/Compiled successfully/)
            })

            it(`should've emitted a single CSS file`, async () => {
              const cssFolder = join(appDir, '.next/static/css')

              const files = await readdir(cssFolder)
              const cssFiles = files.filter((f) => /\.css$/.test(f))

              expect(cssFiles.length).toBe(1)
              const cssContent = await readFile(
                join(cssFolder, cssFiles[0]),
                'utf8'
              )
              expect(
                cssContent.replace(/\/\*.*?\*\//g, '').trim()
              ).toMatchSnapshot()
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
        let stdout
        let code
        beforeAll(async () => {
          await remove(join(appDir, '.next'))
          ;({ code, stdout } = await nextBuild(appDir, [], {
            stdout: true,
          }))
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(async () => {
          await killApp(app)
        })

        it('should have compiled successfully', () => {
          expect(code).toBe(0)
          expect(stdout).toMatch(/Compiled successfully/)
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

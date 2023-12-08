/* eslint-env jest */
import cheerio from 'cheerio'
import { readdir, readFile, remove } from 'fs-extra'
import {
  findPort,
  killApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

describe('CSS Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('CSS Compilation and Prefixing', () => {
      const appDir = join(fixturesDir, 'compilation-and-prefixing')

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

      it(`should've compiled and prefixed`, async () => {
        const cssFolder = join(appDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssFiles = files.filter((f) => /\.css$/.test(f))

        expect(cssFiles.length).toBe(1)
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `"@media (min-width:480px) and (max-width:767px){::placeholder{color:green}}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}.transform-parsing{transform:translate3d(0,0)}.css-grid-shorthand{grid-column:span 2}.g-docs-sidenav .filter::-webkit-input-placeholder{opacity:80%}"`
        )

        // Contains a source map
        expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
      })

      it(`should've emitted a source map`, async () => {
        const cssFolder = join(appDir, '.next/static/css')

        const files = await readdir(cssFolder)
        const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

        expect(cssMapFiles.length).toBe(1)
        const cssMapContent = (
          await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
        ).trim()

        const { version, mappings, sourcesContent } = JSON.parse(cssMapContent)
        expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
          {
            "mappings": "AAAA,+CACE,cACE,WACF,CACF,CAEA,cACE,2CACF,CAEA,mBACE,0BACF,CAEA,oBACE,kBACF,CAEA,mDACE,WACF",
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
      })
    })

    describe('React Lifecyce Order (production)', () => {
      const appDir = join(fixturesDir, 'transition-react')
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
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
          const text = await browser.waitForElementByCss('#red-title').text()
          expect(text).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })

    describe('Has CSS in computed styles in Production', () => {
      const appDir = join(fixturesDir, 'multi-page')

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
        expect(cssSheet.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

        /* ensure CSS preloaded first */
        const allPreloads = [].slice.call($('link[rel="preload"]'))
        const styleIndexes = allPreloads.flatMap((p, i) =>
          p.attribs.as === 'style' ? i : []
        )
        expect(styleIndexes).toEqual([0])
      })
    })

    describe('Good CSS Import from node_modules', () => {
      const appDir = join(fixturesDir, 'npm-import')

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
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
          /nprogress/
        )
      })
    })

    describe('Good Nested CSS Import from node_modules', () => {
      const appDir = join(fixturesDir, 'npm-import-nested')

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
        const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`".other{color:blue}.test{color:red}"`)
      })
    })
  })
})

// https://github.com/vercel/next.js/issues/15468
describe('CSS Property Ordering', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'next-issue-15468')

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
})

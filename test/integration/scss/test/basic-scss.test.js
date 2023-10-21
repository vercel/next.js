/* eslint-env jest */

import cheerio from 'cheerio'
import { readdir, readFile, remove } from 'fs-extra'
import {
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import { quote as shellQuote } from 'shell-quote'

const fixturesDir = join(__dirname, '../..', 'scss-fixtures')

describe('SCSS Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    describe('Friendly Webpack Error', () => {
      const appDir = join(fixturesDir, 'webpack-error')

      const mockFile = join(appDir, 'mock.js')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      it('should be a friendly error successfully', async () => {
        const { code, stderr } = await nextBuild(appDir, [], {
          env: { NODE_OPTIONS: shellQuote([`--require`, mockFile]) },
          stderr: true,
        })
        let cleanScssErrMsg =
          '\n\n' +
          './styles/global.scss\n' +
          "To use Next.js' built-in Sass support, you first need to install `sass`.\n" +
          'Run `npm i sass` or `yarn add sass` inside your workspace.\n' +
          '\n' +
          'Learn more: https://nextjs.org/docs/messages/install-sass\n'

        // eslint-disable-next-line
        expect(code).toBe(1)
        // eslint-disable-next-line
        expect(stderr).toContain('Failed to compile.')
        // eslint-disable-next-line
        expect(stderr).toContain(cleanScssErrMsg)
        // eslint-disable-next-line
        expect(stderr).not.toContain('css-loader')
        // eslint-disable-next-line
        expect(stderr).not.toContain('sass-loader')
      })
    })

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
          `".redText ::placeholder{color:red}.flex-parsing{flex:0 0 calc(50% - var(--vertical-gutter))}"`
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
  "mappings": "AAEE,uBACE,SAHE,CAON,cACE,2CAAA",
  "sourcesContent": [
    "$var: red;
.redText {
  ::placeholder {
    color: $var;
  }
}

.flex-parsing {
  flex: 0 0 calc(50% - var(--vertical-gutter));
}
",
  ],
  "version": 3,
}
`)
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
  })

  describe('development mode', () => {
    describe('Can hot reload CSS without losing state', () => {
      const appDir = join(fixturesDir, 'multi-page')

      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })

      let appPort
      let app
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      it('should update CSS color without remounting <input>', async () => {
        let browser
        try {
          browser = await webdriver(appPort, '/page1')

          const desiredText = 'hello world'
          await browser.elementById('text-input').type(desiredText)
          expect(await browser.elementById('text-input').getValue()).toBe(
            desiredText
          )

          const currentColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('.red-text')).color`
          )
          expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

          const cssFile = new File(join(appDir, 'styles/global1.scss'))
          try {
            cssFile.replace('$var: red', '$var: purple')
            await waitFor(2000) // wait for HMR

            const refreshedColor = await browser.eval(
              `window.getComputedStyle(document.querySelector('.red-text')).color`
            )
            expect(refreshedColor).toMatchInlineSnapshot(`"rgb(128, 0, 128)"`)

            // ensure text remained
            expect(await browser.elementById('text-input').getValue()).toBe(
              desiredText
            )
          } finally {
            cssFile.restore()
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })
    })
  })
})

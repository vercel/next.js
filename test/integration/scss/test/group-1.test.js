/* eslint-env jest */

import cheerio from 'cheerio'
import 'flat-map-polyfill'
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

      expect(code).toBe(1)
      expect(stderr).toContain('Failed to compile.')
      expect(stderr).toContain(cleanScssErrMsg)
      expect(stderr).not.toContain('css-loader')
      expect(stderr).not.toContain('sass-loader')
    })
  })

  describe('Basic Global Support', () => {
    const appDir = join(fixturesDir, 'single-global')

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
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })

  describe('Basic Module Include Paths Support', () => {
    const appDir = join(fixturesDir, 'basic-module-include-paths')

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
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })

  describe('Basic Module Prepend Data Support', () => {
    const appDir = join(fixturesDir, 'basic-module-prepend-data')

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
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })

  describe('Basic Global Support with src/ dir', () => {
    const appDir = join(fixturesDir, 'single-global-src')

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
      expect(await readFile(join(cssFolder, cssFiles[0]), 'utf8')).toContain(
        'color:red'
      )
    })
  })

  describe('Multi Global Support', () => {
    const appDir = join(fixturesDir, 'multi-global')

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
      ).toMatchInlineSnapshot(`".red-text{color:red}.blue-text{color:blue}"`)
    })
  })

  describe('Nested @import() Global Support', () => {
    const appDir = join(fixturesDir, 'nested-global')

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
      ).toMatchInlineSnapshot(
        `".red-text{color:purple;font-weight:bolder;color:red}.blue-text{color:orange;font-weight:bolder;color:blue}"`
      )
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
        Object {
          "mappings": "AAEE,uBACE,SAHE,CAON,cACE,2CAAA",
          "sourcesContent": Array [
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

  // Tests css ordering
  describe('Multi Global Support (reversed)', () => {
    const appDir = join(fixturesDir, 'multi-global-reversed')

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
      ).toMatchInlineSnapshot(`".blue-text{color:blue}.red-text{color:red}"`)
    })
  })

  describe('Invalid CSS in _document', () => {
    const appDir = join(fixturesDir, 'invalid-module-document')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles.module.scss')
      expect(stderr).toMatch(
        /CSS.*cannot.*be imported within.*pages[\\/]_document\.js/
      )
      expect(stderr).toMatch(/Location:.*pages[\\/]_document\.js/)
    })
  })

  describe('Invalid Global CSS', () => {
    const appDir = join(fixturesDir, 'invalid-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.scss')
      expect(stderr).toMatch(
        /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
      )
      expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
    })
  })

  describe('Invalid Global CSS with Custom App', () => {
    const appDir = join(fixturesDir, 'invalid-global-with-app')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.scss')
      expect(stderr).toMatch(
        /Please move all first-party global CSS imports.*?pages(\/|\\)_app/
      )
      expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
    })
  })

  describe('Valid and Invalid Global CSS with Custom App', () => {
    const appDir = join(fixturesDir, 'valid-and-invalid-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(code).not.toBe(0)
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.scss')
      expect(stderr).toContain('Please move all first-party global CSS imports')
      expect(stderr).toMatch(/Location:.*pages[\\/]index\.js/)
    })
  })

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

  describe('Has CSS in computed styles in Development', () => {
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

    it('should have CSS for page', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/page2')

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.blue-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Body is not hidden when unused in Development', () => {
    const appDir = join(fixturesDir, 'unused')

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

    it('should have body visible', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        const currentDisplay = await browser.eval(
          `window.getComputedStyle(document.querySelector('body')).display`
        )
        expect(currentDisplay).toBe('block')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Body is not hidden when broken in Development', () => {
    const appDir = join(fixturesDir, 'unused')

    let appPort
    let app
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    it('should have body visible', async () => {
      const pageFile = new File(join(appDir, 'pages/index.js'))
      let browser
      try {
        pageFile.replace('<div />', '<div>')
        await waitFor(2000) // wait for recompile

        browser = await webdriver(appPort, '/')
        const currentDisplay = await browser.eval(
          `window.getComputedStyle(document.querySelector('body')).display`
        )
        expect(currentDisplay).toBe('block')
      } finally {
        pageFile.restore()
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
      expect(cssPreload.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

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

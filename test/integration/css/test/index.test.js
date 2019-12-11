/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { readdir, readFile, remove } from 'fs-extra'
import {
  findPort,
  nextBuild,
  launchApp,
  killApp,
  nextServer,
  startApp,
  stopApp,
  File,
  waitFor,
  renderViaHTTP,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import escapeStringRegexp from 'escape-string-regexp'
import cheerio from 'cheerio'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 3

const fixturesDir = join(__dirname, '..', 'fixtures')

if (!Array.prototype.flat) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'flat', {
    configurable: true,
    value: function flat() {
      var depth = isNaN(arguments[0]) ? 1 : Number(arguments[0])

      return depth
        ? Array.prototype.reduce.call(
            this,
            function(acc, cur) {
              if (Array.isArray(cur)) {
                acc.push.apply(acc, flat.call(cur, depth - 1))
              } else {
                acc.push(cur)
              }

              return acc
            },
            []
          )
        : Array.prototype.slice.call(this)
    },
    writable: true,
  })
}

if (!Array.prototype.flatMap) {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Array.prototype, 'flatMap', {
    configurable: true,
    value: function flatMap() {
      return Array.prototype.map.apply(this, arguments).flat()
    },
    writable: true,
  })
}

describe('CSS Support', () => {
  describe('Basic Global Support', () => {
    const appDir = join(fixturesDir, 'single-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

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

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

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

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".red-text{color:red}.blue-text{color:#00f}"`)
    })
  })

  describe('Nested @import() Global Support', () => {
    const appDir = join(fixturesDir, 'nested-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `".red-text{color:purple;font-weight:bolder;color:red}.blue-text{color:orange;font-weight:bolder;color:#00f}"`
      )
    })
  })

  describe('CSS Compilation and Prefixing', () => {
    const appDir = join(fixturesDir, 'compilation-and-prefixing')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've compiled and prefixed`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `"@media (min-width:480px) and (max-width:767px){::-webkit-input-placeholder{color:green}::-moz-placeholder{color:green}:-ms-input-placeholder{color:green}::-ms-input-placeholder{color:green}::placeholder{color:green}}"`
      )

      // Contains a source map
      expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
    })

    it(`should've emitted a source map`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssMapFiles = files.filter(f => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
      const cssMapContent = (
        await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
      ).trim()

      const { version, mappings, sourcesContent } = JSON.parse(cssMapContent)
      expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
        Object {
          "mappings": "AAAA,+CACE,4BACE,WACF,CAFA,mBACE,WACF,CAFA,uBACE,WACF,CAFA,wBACE,WACF,CAFA,cACE,WACF,CACF",
          "sourcesContent": Array [
            "@media (480px <= width < 768px) {
          ::placeholder {
            color: green;
          }
        }
        ",
          ],
          "version": 3,
        }
      `)
    })
  })

  describe('CSS Customization', () => {
    const appDir = join(fixturesDir, 'custom-configuration')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've compiled and prefixed`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `"@media (480px <= width < 768px){::placeholder{color:green}}.video{max-width:400px;max-height:300px}"`
      )

      // Contains a source map
      expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
    })

    it(`should've emitted a source map`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssMapFiles = files.filter(f => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
      const cssMapContent = (
        await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
      ).trim()

      const { version, mappings, sourcesContent } = JSON.parse(cssMapContent)
      expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
        Object {
          "mappings": "AACA,gCACE,cACE,WACF,CACF,CAGA,OACE,eAA0B,CAA1B,gBACF",
          "sourcesContent": Array [
            "/* this should pass through untransformed */
        @media (480px <= width < 768px) {
          ::placeholder {
            color: green;
          }
        }

        /* this should be transformed to width/height */
        .video {
          -xyz-max-size: 400px 300px;
        }
        ",
          ],
          "version": 3,
        }
      `)
    })
  })

  describe('CSS Customization Array', () => {
    const appDir = join(fixturesDir, 'custom-configuration-arr')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've compiled and prefixed`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(
        `"@media (480px <= width < 768px){a:before{content:\\"\\"}::placeholder{color:green}}.video{max-width:6400px;max-height:4800px;max-width:400rem;max-height:300rem}"`
      )

      // Contains a source map
      expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
    })

    it(`should've emitted a source map`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssMapFiles = files.filter(f => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
      const cssMapContent = (
        await readFile(join(cssFolder, cssMapFiles[0]), 'utf8')
      ).trim()

      const { version, mappings, sourcesContent } = JSON.parse(cssMapContent)
      expect({ version, mappings, sourcesContent }).toMatchInlineSnapshot(`
        Object {
          "mappings": "AACA,gCACE,SACE,UACF,CACA,cACE,WACF,CACF,CAGA,OACE,gBAA4B,CAA5B,iBAA4B,CAA5B,gBAA4B,CAA5B,iBACF",
          "sourcesContent": Array [
            "/* this should pass through untransformed */
        @media (480px <= width < 768px) {
          a::before {
            content: '';
          }
          ::placeholder {
            color: green;
          }
        }

        /* this should be transformed to width/height */
        .video {
          -xyz-max-size: 400rem 300rem;
        }
        ",
          ],
          "version": 3,
        }
      `)
    })
  })

  describe('Bad CSS Customization', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(/field which is not supported.*?sourceMap/)
      ;[
        'postcss-modules-values',
        'postcss-modules-scope',
        'postcss-modules-extract-imports',
        'postcss-modules-local-by-default',
        'postcss-modules',
      ].forEach(plugin => {
        expect(stderr).toMatch(
          new RegExp(`Please remove the.*?${escapeStringRegexp(plugin)}`)
        )
      })
    })

    it(`should've compiled and prefixed`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".video{max-width:400px;max-height:300px}"`)

      // Contains a source map
      expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
    })

    it(`should've emitted a source map`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssMapFiles = files.filter(f => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
    })
  })

  describe('Bad CSS Customization Array (1)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-1')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /A PostCSS Plugin was passed as an array but did not provide its configuration \('postcss-trolling'\)/
      )
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  describe('Bad CSS Customization Array (2)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-2')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /Error: Your PostCSS configuration for 'postcss-trolling' cannot have null configuration./
      )
      expect(stderr).toMatch(
        /To disable 'postcss-trolling', pass false, otherwise, pass true or a configuration object./
      )
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  describe('Bad CSS Customization Array (3)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-3')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /A PostCSS Plugin must be provided as a string. Instead, we got: '5'/
      )
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  describe('Bad CSS Customization Array (4)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-4')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(/An unknown PostCSS plugin was provided \(5\)/)
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  describe('Bad CSS Customization Array (5)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-5')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /Your custom PostCSS configuration must export a `plugins` key./
      )
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  describe('Bad CSS Customization Array (6)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-6')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /Your custom PostCSS configuration must export a `plugins` key./
      )
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  describe('Bad CSS Customization Array (7)', () => {
    const appDir = join(fixturesDir, 'bad-custom-configuration-arr-7')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(stderr).toMatch(
        /A PostCSS Plugin was passed as an array but did not provide its configuration \('postcss-trolling'\)/
      )
      expect(stderr).toMatch(/Build error occurred/)
    })
  })

  // Tests css ordering
  describe('Multi Global Support (reversed)', () => {
    const appDir = join(fixturesDir, 'multi-global-reversed')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".blue-text{color:#00f}.red-text{color:red}"`)
    })
  })

  describe('Invalid Global CSS', () => {
    const appDir = join(fixturesDir, 'invalid-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.css')
      expect(stderr).toMatch(
        /Please move all global CSS imports.*?pages(\/|\\)_app/
      )
    })
  })

  describe('Invalid Global CSS with Custom App', () => {
    const appDir = join(fixturesDir, 'invalid-global-with-app')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.css')
      expect(stderr).toMatch(
        /Please move all global CSS imports.*?pages(\/|\\)_app/
      )
    })
  })

  describe('Valid and Invalid Global CSS with Custom App', () => {
    const appDir = join(fixturesDir, 'valid-and-invalid-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('styles/global.css')
      expect(stderr).toContain('Please move all global CSS imports')
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
        await waitFor(2000) // ensure application hydrates

        const desiredText = 'hello world'
        await browser.elementById('text-input').type(desiredText)
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.red-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

        const cssFile = new File(join(appDir, 'styles/global1.css'))
        try {
          cssFile.replace('color: red', 'color: purple')
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

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      await nextBuild(appDir)
      const server = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      app = await startApp(server)
      appPort = app.address().port
    })
    afterAll(async () => {
      await stopApp(app)
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

  describe('CSS URL via `file-loader', () => {
    const appDir = join(fixturesDir, 'url-global')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've emitted expected files`, async () => {
      const cssFolder = join(appDir, '.next/static/css')
      const mediaFolder = join(appDir, '.next/static/media')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
        /^\.red-text\{color:red;background-image:url\(static\/media\/dark\.[a-z0-9]{32}\.svg\) url\(static\/media\/dark2\.[a-z0-9]{32}\.svg\)\}\.blue-text\{color:orange;font-weight:bolder;background-image:url\(static\/media\/light\.[a-z0-9]{32}\.svg\);color:#00f\}$/
      )

      const mediaFiles = await readdir(mediaFolder)
      expect(mediaFiles.length).toBe(3)
      expect(
        mediaFiles
          .map(fileName =>
            /^(.+?)\..{32}\.(.+?)$/
              .exec(fileName)
              .slice(1)
              .join('.')
          )
          .sort()
      ).toMatchInlineSnapshot(`
        Array [
          "dark.svg",
          "dark2.svg",
          "light.svg",
        ]
      `)
    })
  })

  describe('Ordering with styled-jsx (dev)', () => {
    const appDir = join(fixturesDir, 'with-styled-jsx')

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

    it('should have the correct color (css ordering)', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await waitFor(2000) // ensure application hydrates

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.my-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Ordering with styled-jsx (prod)', () => {
    const appDir = join(fixturesDir, 'with-styled-jsx')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      await nextBuild(appDir)
      const server = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      app = await startApp(server)
      appPort = app.address().port
    })
    afterAll(async () => {
      await stopApp(app)
    })

    it('should have the correct color (css ordering)', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await waitFor(2000) // ensure application hydrates

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('.my-text')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Basic Tailwind CSS', () => {
    const appDir = join(fixturesDir, 'with-tailwindcss')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should build successfully', async () => {
      await nextBuild(appDir)
    })

    it(`should've compiled and prefixed`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(cssContent).toMatch(/object-right-bottom/) // look for tailwind's CSS
      expect(cssContent).not.toMatch(/tailwind/) // ensure @tailwind was removed

      // Contains a source map
      expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
    })

    it(`should've emitted a source map`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssMapFiles = files.filter(f => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
    })
  })

  describe('Basic CSS Module Support', () => {
    const appDir = join(fixturesDir, 'basic-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      await nextBuild(appDir)
      const server = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      app = await startApp(server)
      appPort = app.address().port
    })
    afterAll(async () => {
      await stopApp(app)
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".index_redText__3CwEB{color:red}"`)
    })

    it(`should've injected the CSS on server render`, async () => {
      const content = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(content)

      const cssPreload = $('link[rel="preload"][as="style"]')
      expect(cssPreload.length).toBe(1)
      expect(cssPreload.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      expect(cssSheet.attr('href')).toMatch(/^\/_next\/static\/css\/.*\.css$/)

      expect($('#verify-red').attr('class')).toMatchInlineSnapshot(
        `"index_redText__3CwEB"`
      )
    })
  })

  describe('Has CSS Module in computed styles in Development', () => {
    const appDir = join(fixturesDir, 'dev-module')

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
        browser = await webdriver(appPort, '/')

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Has CSS Module in computed styles in Production', () => {
    const appDir = join(fixturesDir, 'prod-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      await nextBuild(appDir)
      const server = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      app = await startApp(server)
      appPort = app.address().port
    })
    afterAll(async () => {
      await stopApp(app)
    })

    it('should have CSS for page', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('Can hot reload CSS Module without losing state', () => {
    const appDir = join(fixturesDir, 'hmr-module')

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

    // FIXME: this is broken
    it.skip('should update CSS color without remounting <input>', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')
        await waitFor(2000) // ensure application hydrates

        const desiredText = 'hello world'
        await browser.elementById('text-input').type(desiredText)
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )

        const currentColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

        const cssFile = new File(join(appDir, 'pages/index.module.css'))
        try {
          cssFile.replace('color: red', 'color: purple')
          await waitFor(2000) // wait for HMR

          const refreshedColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('#verify-red')).color`
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

  describe('Invalid CSS Module Usage in node_modules', () => {
    const appDir = join(fixturesDir, 'invalid-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail to build', async () => {
      const { stderr } = await nextBuild(appDir, [], {
        stderr: true,
      })
      expect(stderr).toContain('Failed to compile')
      expect(stderr).toContain('node_modules/example/index.module.css')
      expect(stderr).toMatch(
        /CSS Modules.*cannot.*be imported from within.*node_modules/
      )
    })
  })

  describe('Valid CSS Module Usage from within node_modules', () => {
    const appDir = join(fixturesDir, 'nm-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      await nextBuild(appDir)
      const server = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      app = await startApp(server)
      appPort = app.address().port
    })
    afterAll(async () => {
      await stopApp(app)
    })

    it(`should've prerendered with relevant data`, async () => {
      const content = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(content)

      const cssPreload = $('#nm-div')
      expect(cssPreload.text()).toMatchInlineSnapshot(
        `"{\\"message\\":\\"Why hello there\\"} {\\"redText\\":\\"example_redText__1rb5g\\"}"`
      )
    })

    it(`should've emitted a single CSS file`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter(f => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')

      expect(
        cssContent.replace(/\/\*.*?\*\//g, '').trim()
      ).toMatchInlineSnapshot(`".example_redText__1rb5g{color:\\"red\\"}"`)
    })
  })

  describe('CSS Module client-side navigation in Production', () => {
    const appDir = join(fixturesDir, 'multi-module')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    let appPort
    let app
    beforeAll(async () => {
      await nextBuild(appDir)
      const server = nextServer({
        dir: appDir,
        dev: false,
        quiet: true,
      })

      app = await startApp(server)
      appPort = app.address().port
    })
    afterAll(async () => {
      await stopApp(app)
    })

    it('should be able to client-side navigate from red to blue', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/red')

        await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

        const redColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(redColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

        await browser.elementByCss('#link-blue').click()

        await browser.waitForElementByCss('#verify-blue')

        const blueColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-blue')).color`
        )
        expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

        expect(
          await browser.eval(`window.__did_not_ssr`)
        ).toMatchInlineSnapshot(`"make sure this is set"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should be able to client-side navigate from blue to red', async () => {
      const content = await renderViaHTTP(appPort, '/blue')
      const $ = cheerio.load(content)

      // Ensure only `/blue` page's CSS is preloaded
      const serverCssPreloads = $('link[rel="preload"][as="style"]')
      expect(serverCssPreloads.length).toBe(1)

      let browser
      try {
        browser = await webdriver(appPort, '/blue')

        await waitFor(2000) // Ensure hydration

        await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

        const redColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-blue')).color`
        )
        expect(redColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

        // Check that Red was preloaded
        const result = await browser.eval(
          `[].slice.call(document.querySelectorAll('link[rel="preload"][as="style"]')).map(e=>({href:e.href})).sort()`
        )
        expect(result.length).toBe(2)

        // Check that CSS was not loaded as script
        const cssPreloads = await browser.eval(
          `[].slice.call(document.querySelectorAll('link[rel=preload][href*=".css"]')).map(e=>e.as)`
        )
        expect(cssPreloads.every(e => e === 'style')).toBe(true)

        await browser.elementByCss('#link-red').click()

        await browser.waitForElementByCss('#verify-red')

        const blueColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(blueColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

        expect(
          await browser.eval(`window.__did_not_ssr`)
        ).toMatchInlineSnapshot(`"make sure this is set"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should be able to client-side navigate from none to red', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/none')

        await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

        await browser.elementByCss('#link-red').click()
        await browser.waitForElementByCss('#verify-red')

        const blueColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-red')).color`
        )
        expect(blueColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)

        expect(
          await browser.eval(`window.__did_not_ssr`)
        ).toMatchInlineSnapshot(`"make sure this is set"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should be able to client-side navigate from none to blue', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/none')

        await browser.eval(`window.__did_not_ssr = 'make sure this is set'`)

        await browser.elementByCss('#link-blue').click()
        await browser.waitForElementByCss('#verify-blue')

        const blueColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#verify-blue')).color`
        )
        expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

        expect(
          await browser.eval(`window.__did_not_ssr`)
        ).toMatchInlineSnapshot(`"make sure this is set"`)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})

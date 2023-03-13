/* eslint-env jest */
import cheerio from 'cheerio'
import 'flat-map-polyfill'
import { pathExists, readdir, readFile, readJSON, remove } from 'fs-extra'
import {
  check,
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

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

describe('CSS Support', () => {
  describe('CSS Import from node_modules', () => {
    const appDir = join(fixturesDir, 'npm-import-bad')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should fail the build', async () => {
      const { code, stderr } = await nextBuild(appDir, [], { stderr: true })

      expect(code).toBe(0)
      expect(stderr).not.toMatch(/Can't resolve '[^']*?nprogress[^']*?'/)
      expect(stderr).not.toMatch(/Build error occurred/)
    })
  })

  describe('Ordering with styled-jsx (dev)', () => {
    const appDir = join(fixturesDir, 'with-styled-jsx')

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

    it('should have the correct color (css ordering)', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('.my-text')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
    })
  })

  describe('Ordering with styled-jsx (prod)', () => {
    const appDir = join(fixturesDir, 'with-styled-jsx')

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

    it('should have the correct color (css ordering)', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('.my-text')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 128, 0)"`)
    })
  })

  describe('Ordering with Global CSS and Modules (dev)', () => {
    const appDir = join(fixturesDir, 'global-and-module-ordering')

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

    it('should not execute scripts in any order', async () => {
      const content = await renderViaHTTP(appPort, '/')
      const $ = cheerio.load(content)

      let asyncCount = 0
      let totalCount = 0
      for (const script of $('script').toArray()) {
        ++totalCount
        if ('async' in script.attribs) {
          ++asyncCount
        }
      }

      expect(asyncCount).toBe(0)
      expect(totalCount).not.toBe(0)
    })

    it('should have the correct color (css ordering)', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#blueText')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
    })

    it('should have the correct color (css ordering) during hot reloads', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/')

        const blueColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#blueText')).color`
        )
        expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

        const yellowColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#yellowText')).color`
        )
        expect(yellowColor).toMatchInlineSnapshot(`"rgb(255, 255, 0)"`)

        const cssFile = new File(join(appDir, 'pages/index.module.css'))
        try {
          cssFile.replace('color: yellow;', 'color: rgb(1, 1, 1);')
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('#yellowText')).color`
              ),
            'rgb(1, 1, 1)'
          )
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('#blueText')).color`
              ),
            'rgb(0, 0, 255)'
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

  describe('Ordering with Global CSS and Modules (prod)', () => {
    const appDir = join(fixturesDir, 'global-and-module-ordering')

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

    it('should have the correct color (css ordering)', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#blueText')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
    })
  })

  // https://github.com/vercel/next.js/issues/15468
  describe('CSS Property Ordering', () => {
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

  describe('Basic Tailwind CSS', () => {
    const appDir = join(fixturesDir, 'with-tailwindcss')

    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })

    it('should compile successfully', async () => {
      const { code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      })
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
      expect(stdout).toContain('.css')
    })

    it(`should've compiled and prefixed`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

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
      const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
    })
  })

  describe('Tailwind and Purge CSS', () => {
    const appDir = join(fixturesDir, 'with-tailwindcss-and-purgecss')

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

      expect(cssContent).not.toMatch(/object-right-bottom/) // this was unused and should be gone
      expect(cssContent).toMatch(/text-blue-500/) // this was used
      expect(cssContent).not.toMatch(/tailwind/) // ensure @tailwind was removed

      // Contains a source map
      expect(cssContent).toMatch(/\/\*#\s*sourceMappingURL=(.+\.map)\s*\*\//)
    })

    it(`should've emitted a source map`, async () => {
      const cssFolder = join(appDir, '.next/static/css')

      const files = await readdir(cssFolder)
      const cssMapFiles = files.filter((f) => /\.css\.map$/.test(f))

      expect(cssMapFiles.length).toBe(1)
    })
  })

  // https://github.com/vercel/next.js/issues/18557
  describe('CSS page transition inject <style> with nonce so it works with CSP header', () => {
    const appDir = join(fixturesDir, 'csp-style-src-nonce')
    let app, appPort

    function tests() {
      async function checkGreenTitle(browser) {
        await browser.waitForElementByCss('#green-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#green-title')).color`
        )
        expect(titleColor).toBe('rgb(0, 128, 0)')
      }
      async function checkBlueTitle(browser) {
        await browser.waitForElementByCss('#blue-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#blue-title')).color`
        )
        expect(titleColor).toBe('rgb(0, 0, 255)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenTitle(browser)
          await browser.waitForElementByCss('#link-other').moveTo()
          await waitFor(2000)
          await checkGreenTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should not change color on hover', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenTitle(browser)
          await browser.waitForElementByCss('#link-other').moveTo()
          await waitFor(2000)
          await checkGreenTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct CSS injection order', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenTitle(browser)

          const prevSiblingHref = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]').previousSibling.getAttribute('href')`
          )
          const currentPageHref = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]').getAttribute('href')`
          )
          expect(prevSiblingHref).toBeDefined()
          expect(prevSiblingHref).toBe(currentPageHref)

          // Navigate to other:
          await browser.waitForElementByCss('#link-other').click()
          await checkBlueTitle(browser)

          const newPrevSibling = await browser.eval(
            `document.querySelector('style[data-n-href]').previousSibling.getAttribute('data-n-css')`
          )
          const newPageHref = await browser.eval(
            `document.querySelector('style[data-n-href]').getAttribute('data-n-href')`
          )
          expect(newPrevSibling).toBe('VmVyY2Vs')
          expect(newPageHref).toBeDefined()
          expect(newPageHref).not.toBe(currentPageHref)

          // Navigate to home:
          await browser.waitForElementByCss('#link-index').click()
          await checkGreenTitle(browser)

          const newPrevSibling2 = await browser.eval(
            `document.querySelector('style[data-n-href]').previousSibling.getAttribute('data-n-css')`
          )
          const newPageHref2 = await browser.eval(
            `document.querySelector('style[data-n-href]').getAttribute('data-n-href')`
          )
          expect(newPrevSibling2).toBeTruthy()
          expect(newPageHref2).toBeDefined()
          expect(newPageHref2).toBe(currentPageHref)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav from index)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenTitle(browser)
          await browser.waitForElementByCss('#link-other').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-index')
          await checkBlueTitle(browser)

          // Navigate back to index:
          await browser.waitForElementByCss('#link-index').click()
          await checkGreenTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav from other)', async () => {
        const browser = await webdriver(appPort, '/other')
        try {
          await checkBlueTitle(browser)
          await browser.waitForElementByCss('#link-index').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-other')
          await checkGreenTitle(browser)

          // Navigate back to other:
          await browser.waitForElementByCss('#link-other').click()
          await checkBlueTitle(browser)
        } finally {
          await browser.close()
        }
      })
    }

    describe('Production Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })
  })

  // https://github.com/vercel/next.js/issues/12445
  describe('CSS Modules Composes Ordering', () => {
    const appDir = join(fixturesDir, 'composes-ordering')
    let app, appPort

    function tests(isDev = false) {
      async function checkBlackTitle(browser) {
        await browser.waitForElementByCss('#black-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#black-title')).color`
        )
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }
      async function checkRedTitle(browser) {
        await browser.waitForElementByCss('#red-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#red-title')).color`
        )
        expect(titleColor).toBe('rgb(255, 0, 0)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await browser.waitForElementByCss('#link-other').moveTo()
          await waitFor(2000)
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      if (!isDev) {
        it('should not change color on hover', async () => {
          const browser = await webdriver(appPort, '/')
          try {
            await checkBlackTitle(browser)
            await browser.waitForElementByCss('#link-other').moveTo()
            await waitFor(2000)
            await checkBlackTitle(browser)
          } finally {
            await browser.close()
          }
        })

        it('should have correct CSS injection order', async () => {
          const browser = await webdriver(appPort, '/')
          try {
            await checkBlackTitle(browser)

            const prevSiblingHref = await browser.eval(
              `document.querySelector('link[rel=stylesheet][data-n-p]').previousSibling.getAttribute('href')`
            )
            const currentPageHref = await browser.eval(
              `document.querySelector('link[rel=stylesheet][data-n-p]').getAttribute('href')`
            )
            expect(prevSiblingHref).toBeDefined()
            expect(prevSiblingHref).toBe(currentPageHref)

            // Navigate to other:
            await browser.waitForElementByCss('#link-other').click()
            await checkRedTitle(browser)

            const newPrevSibling = await browser.eval(
              `document.querySelector('style[data-n-href]').previousSibling.getAttribute('data-n-css')`
            )
            const newPageHref = await browser.eval(
              `document.querySelector('style[data-n-href]').getAttribute('data-n-href')`
            )
            expect(newPrevSibling).toBe('')
            expect(newPageHref).toBeDefined()
            expect(newPageHref).not.toBe(currentPageHref)

            // Navigate to home:
            await browser.waitForElementByCss('#link-index').click()
            await checkBlackTitle(browser)

            const newPrevSibling2 = await browser.eval(
              `document.querySelector('style[data-n-href]').previousSibling.getAttribute('data-n-css')`
            )
            const newPageHref2 = await browser.eval(
              `document.querySelector('style[data-n-href]').getAttribute('data-n-href')`
            )
            expect(newPrevSibling2).toBe('')
            expect(newPageHref2).toBeDefined()
            expect(newPageHref2).toBe(currentPageHref)
          } finally {
            await browser.close()
          }
        })
      }

      it('should have correct color on index page (on nav from index)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await browser.waitForElementByCss('#link-other').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-index')
          await checkRedTitle(browser)

          // Navigate back to index:
          await browser.waitForElementByCss('#link-index').click()
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav from other)', async () => {
        const browser = await webdriver(appPort, '/other')
        try {
          await checkRedTitle(browser)
          await browser.waitForElementByCss('#link-index').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-other')
          await checkBlackTitle(browser)

          // Navigate back to other:
          await browser.waitForElementByCss('#link-other').click()
          await checkRedTitle(browser)
        } finally {
          await browser.close()
        }
      })
    }

    describe('Development Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests(true)
    })

    describe('Production Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })
  })

  describe('CSS Cleanup on Render Failure', () => {
    const appDir = join(fixturesDir, 'transition-cleanup')
    let app, appPort

    function tests() {
      async function checkBlackTitle(browser) {
        await browser.waitForElementByCss('#black-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#black-title')).color`
        )
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }

      it('not have intermediary page styles on error rendering', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)

          const currentPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]')`
          )
          expect(currentPageStyles).toBeDefined()

          // Navigate to other:
          await browser.waitForElementByCss('#link-other').click()
          await check(
            () => browser.eval(`document.body.innerText`),
            'Application error: a client-side exception has occurred (see the browser console for more information).',
            true
          )

          const newPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]')`
          )
          expect(newPageStyles).toBeFalsy()

          const allPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet]')`
          )
          expect(allPageStyles).toBeFalsy()
        } finally {
          await browser.close()
        }
      })
    }

    describe('Production Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })
  })

  describe('Page reload on CSS missing', () => {
    const appDir = join(fixturesDir, 'transition-reload')
    let app, appPort

    function tests() {
      async function checkBlackTitle(browser) {
        await browser.waitForElementByCss('#black-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#black-title')).color`
        )
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }

      it('should fall back to server-side transition on missing CSS', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await browser.eval(`window.__priorNavigatePageState = 'OOF';`)

          // Navigate to other:
          await browser.waitForElementByCss('#link-other').click()
          // Wait for navigation:
          await browser.waitForElementByCss('#link-index')

          const state = await browser.eval(`window.__priorNavigatePageState`)
          expect(state).toBeFalsy()
        } finally {
          await browser.close()
        }
      })
    }

    describe('Production Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
        appPort = await findPort()
        app = await nextStart(appDir, appPort)

        // Remove other page CSS files:
        const manifest = await readJSON(
          join(appDir, '.next', 'build-manifest.json')
        )
        const files = manifest['pages']['/other'].filter((e) =>
          e.endsWith('.css')
        )
        if (files.length < 1) throw new Error()
        await Promise.all(files.map((f) => remove(join(appDir, '.next', f))))
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })
  })

  describe('Page hydrates with CSS and not waiting on dependencies', () => {
    const appDir = join(fixturesDir, 'hydrate-without-deps')
    let app, appPort

    function tests() {
      async function checkBlackTitle(browser) {
        await browser.waitForElementByCss('#black-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#black-title')).color`
        )
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }
      async function checkRedTitle(browser) {
        await browser.waitForElementByCss('#red-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#red-title')).color`
        )
        expect(titleColor).toBe('rgb(255, 0, 0)')
      }

      it('should hydrate black without dependencies manifest', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await check(
            () => browser.eval(`document.querySelector('p').innerText`),
            'mounted'
          )
        } finally {
          await browser.close()
        }
      })

      it('should hydrate red without dependencies manifest', async () => {
        const browser = await webdriver(appPort, '/client')
        try {
          await checkRedTitle(browser)
          await check(
            () => browser.eval(`document.querySelector('p').innerText`),
            'mounted'
          )
        } finally {
          await browser.close()
        }
      })

      it('should route from black to red without dependencies', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await check(
            () => browser.eval(`document.querySelector('p').innerText`),
            'mounted'
          )
          await browser.eval(`document.querySelector('#link-client').click()`)
          await checkRedTitle(browser)
          await check(
            () => browser.eval(`document.querySelector('p').innerText`),
            'mounted'
          )
        } finally {
          await browser.close()
        }
      })
    }

    describe('Production Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
        appPort = await findPort()
        app = await nextStart(appDir, appPort)

        const buildId = (
          await readFile(join(appDir, '.next', 'BUILD_ID'), 'utf8')
        ).trim()
        const fileName = join(
          appDir,
          '.next/static/',
          buildId,
          '_buildManifest.js'
        )
        if (!(await pathExists(fileName))) {
          throw new Error('Missing build manifest')
        }
        await remove(fileName)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })
  })

  // https://github.com/vercel/next.js/issues/12343
  describe('Basic CSS Modules Ordering', () => {
    const appDir = join(fixturesDir, 'next-issue-12343')
    let app, appPort

    function tests() {
      async function checkGreenButton(browser) {
        await browser.waitForElementByCss('#link-other')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#link-other')).backgroundColor`
        )
        expect(titleColor).toBe('rgb(0, 255, 0)')
      }
      async function checkPinkButton(browser) {
        await browser.waitForElementByCss('#link-index')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#link-index')).backgroundColor`
        )
        expect(titleColor).toBe('rgb(255, 105, 180)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenButton(browser)
          await browser.waitForElementByCss('#link-other').moveTo()
          await waitFor(2000)
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkGreenButton(browser)
          await browser.waitForElementByCss('#link-other').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-index')
          await checkPinkButton(browser)

          // Navigate back to index:
          await browser.waitForElementByCss('#link-index').click()
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })
    }

    describe('Development Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })

    describe('Production Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        await nextBuild(appDir, [], {})
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests()
    })
  })

  describe('should handle unresolved files gracefully', () => {
    const workDir = join(fixturesDir, 'unresolved-css-url')

    it('should build correctly', async () => {
      await remove(join(workDir, '.next'))
      const { code } = await nextBuild(workDir)
      expect(code).toBe(0)
    })

    it('should have correct file references in CSS output', async () => {
      const cssFiles = await readdir(join(workDir, '.next/static/css'))

      for (const file of cssFiles) {
        if (file.endsWith('.css.map')) continue

        const content = await readFile(
          join(workDir, '.next/static/css', file),
          'utf8'
        )
        console.log(file, content)

        // if it is the combined global CSS file there are double the expected
        // results
        const howMany = content.includes('p{') || content.includes('p,') ? 2 : 1

        expect(content.match(/\(\/vercel\.svg/g).length).toBe(howMany)
        // expect(content.match(/\(vercel\.svg/g).length).toBe(howMany)
        expect(content.match(/\(\/_next\/static\/media/g).length).toBe(1)
        expect(content.match(/\(https:\/\//g).length).toBe(howMany)
      }
    })
  })

  describe('Data URLs', () => {
    const workDir = join(fixturesDir, 'data-url')

    it('should compile successfully', async () => {
      await remove(join(workDir, '.next'))
      const { code } = await nextBuild(workDir)
      expect(code).toBe(0)
    })

    it('should have emitted expected files', async () => {
      const cssFolder = join(workDir, '.next/static/css')
      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
        /background:url\("data:[^"]+"\)/
      )
    })
  })
})

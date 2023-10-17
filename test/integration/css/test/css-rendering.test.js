/* eslint-env jest */
import { pathExists, readFile, readJSON, remove } from 'fs-extra'
import {
  check,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

describe('CSS Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
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

    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
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
      }
    )
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

    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
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
      }
    )
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

    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
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
      }
    )
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

    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
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
      }
    )
  })
})

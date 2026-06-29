import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

const fixturesDir = join(__dirname, 'fixtures')

function baseNextConfigWithLightning(useLightningcss: boolean) {
  return `module.exports = {
  onDemandEntries: {
    maxInactiveAge: 1000 * 60 * 60,
  },
  productionBrowserSourceMaps: true,
  experimental: {
    useLightningcss: ${useLightningcss},
  },
}
`
}

describe('CSS Support', () => {
  describe('CSS Import from node_modules', () => {
    describe('experimental.useLightningcss: true', () => {
      const { next } = nextTestSetup({
        files: join(fixturesDir, 'npm-import-bad'),
        dependencies: { nprogress: '0.2.0' },
        skipStart: true,
        overrideFiles: {
          'next.config.js': baseNextConfigWithLightning(true),
        },
      })

      // Turbopack always uses Lightning CSS; webpack also runs the false case below.
      it('should build successfully without false nprogress resolution errors', async () => {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(0)
        expect(cliOutput).not.toMatch(/Can't resolve '[^']*?nprogress[^']*?'/)
        expect(cliOutput).not.toMatch(/Build error occurred/)
      })
    })

    // Webpack runs postcss/lightning toggles; Turbopack always uses Lightning CSS.
    ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
      'experimental.useLightningcss: false',
      () => {
        const { next } = nextTestSetup({
          files: join(fixturesDir, 'npm-import-bad'),
          dependencies: { nprogress: '0.2.0' },
          skipStart: true,
          overrideFiles: {
            'next.config.js': baseNextConfigWithLightning(false),
          },
        })

        it('should build successfully without false nprogress resolution errors', async () => {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).toBe(0)
          expect(cliOutput).not.toMatch(/Can't resolve '[^']*?nprogress[^']*?'/)
          expect(cliOutput).not.toMatch(/Build error occurred/)
        })
      }
    )
  })

  // https://github.com/vercel/next.js/issues/18557
  describe('CSS page transition inject <style> with nonce so it works with CSP header', () => {
    const { next, isTurbopack } = nextTestSetup({
      files: join(fixturesDir, 'csp-style-src-nonce'),
    })

    async function checkGreenTitle(browser: Playwright) {
      await browser.elementByCss('#green-title')
      const titleColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#green-title')).color`
      )
      expect(titleColor).toBe('rgb(0, 128, 0)')
    }

    async function checkBlueTitle(browser: Playwright) {
      await browser.elementByCss('#blue-title')
      const titleColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#blue-title')).color`
      )
      expect(titleColor).toBe('rgb(0, 0, 255)')
    }

    it('should have correct color on index page (on load)', async () => {
      const browser = await next.browser('/')
      await checkGreenTitle(browser)
    })

    it('should have correct color on index page (on hover)', async () => {
      const browser = await next.browser('/')
      await checkGreenTitle(browser)
      await browser.elementByCss('#link-other').moveTo()
      await retry(
        async () => {
          await checkGreenTitle(browser)
        },
        3000,
        500
      )
    })

    it('should not change color on hover', async () => {
      const browser = await next.browser('/')
      await checkGreenTitle(browser)
      await browser.elementByCss('#link-other').moveTo()
      await retry(
        async () => {
          await checkGreenTitle(browser)
        },
        3000,
        500
      )
    })

    it('should have correct CSS injection order', async () => {
      const browser = await next.browser('/')
      // There's a better test for CSS order in test/e2e/app-dir/css-order, this test in particular should check the UI, not the implementation detail of the ordering.
      if (isTurbopack) {
        await checkGreenTitle(browser)

        await browser.elementByCss('#link-other').click()
        await checkBlueTitle(browser)

        await browser.elementByCss('#link-index').click()
        await checkGreenTitle(browser)
      } else {
        await checkGreenTitle(browser)

        const prevSiblingHref = await browser.eval(
          `document.querySelector('link[rel=stylesheet][data-n-p]').previousSibling.getAttribute('href')`
        )
        const currentPageHref = await browser.eval(
          `document.querySelector('link[rel=stylesheet][data-n-p]').getAttribute('href')`
        )
        expect(prevSiblingHref).toBeDefined()
        expect(prevSiblingHref).toBe(currentPageHref)

        await browser.elementByCss('#link-other').click()
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

        await browser.elementByCss('#link-index').click()
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
      }
    })

    it('should have correct color on index page (on nav from index)', async () => {
      const browser = await next.browser('/')
      await checkGreenTitle(browser)
      await browser.elementByCss('#link-other').click()

      await browser.elementByCss('#link-index')
      await checkBlueTitle(browser)

      await browser.elementByCss('#link-index').click()
      await checkGreenTitle(browser)
    })

    it('should have correct color on index page (on nav from other)', async () => {
      const browser = await next.browser('/other')
      await checkBlueTitle(browser)
      await browser.elementByCss('#link-index').click()

      await browser.elementByCss('#link-other')
      await checkGreenTitle(browser)

      await browser.elementByCss('#link-other').click()
      await checkBlueTitle(browser)
    })
  })

  // Turbopack keeps styles which mirrors development with webpack. This test only checks a behavior for webpack.
  describe('CSS Cleanup on Render Failure', () => {
    ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
      'experimental.useLightningcss: true',
      () => {
        const { next } = nextTestSetup({
          files: join(fixturesDir, 'transition-cleanup'),
          overrideFiles: {
            'next.config.js': baseNextConfigWithLightning(true),
          },
        })

        it('not have intermediary page styles on error rendering', async () => {
          const browser = await next.browser('/')
          await browser.elementByCss('#black-title')
          const titleColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('#black-title')).color`
          )
          expect(titleColor).toBe('rgb(17, 17, 17)')

          const currentPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]')`
          )
          expect(currentPageStyles).toBeDefined()

          await browser.elementByCss('#link-other').click()
          await retry(async () => {
            const text = await browser.eval(`document.body.innerText`)
            expect(text).toBe(
              'Application error: a client-side exception has occurred while loading localhost (see the browser console for more information).'
            )
          })

          const newPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]')`
          )
          expect(newPageStyles).toBeFalsy()

          const allPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet]')`
          )
          expect(allPageStyles).toBeFalsy()
        })
      }
    )
    ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
      'experimental.useLightningcss: false',
      () => {
        const { next } = nextTestSetup({
          files: join(fixturesDir, 'transition-cleanup'),
          overrideFiles: {
            'next.config.js': baseNextConfigWithLightning(false),
          },
        })

        // eslint-disable-next-line jest/no-identical-title
        it('not have intermediary page styles on error rendering', async () => {
          const browser = await next.browser('/')
          await browser.elementByCss('#black-title')
          const titleColor = await browser.eval(
            `window.getComputedStyle(document.querySelector('#black-title')).color`
          )
          expect(titleColor).toBe('rgb(17, 17, 17)')

          const currentPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]')`
          )
          expect(currentPageStyles).toBeDefined()

          await browser.elementByCss('#link-other').click()
          await retry(async () => {
            const text = await browser.eval(`document.body.innerText`)
            expect(text).toBe(
              'Application error: a client-side exception has occurred while loading localhost (see the browser console for more information).'
            )
          })

          const newPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet][data-n-p]')`
          )
          expect(newPageStyles).toBeFalsy()

          const allPageStyles = await browser.eval(
            `document.querySelector('link[rel=stylesheet]')`
          )
          expect(allPageStyles).toBeFalsy()
        })
      }
    )
  })

  // TODO: Port by running build, starting the server, deleting emitted CSS from `.next`, then asserting client navigation — needs lifecycle beyond `nextTestSetup` (post-start filesystem mutation + no restart API).
  describe.skip('Page reload on CSS missing', () => {})

  // TODO: Port by running build+start, deleting `_buildManifest.js` under `.next/static/<BUILD_ID>/`, then asserting hydration — needs post-start `.next` mutation while the server stays up.
  describe.skip('Page hydrates with CSS and not waiting on dependencies', () => {})
})

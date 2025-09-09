/* eslint-env jest */
import { join } from 'path'
import { retry } from 'next-test-utils'
import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
      window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot;
      const indicator = root.querySelector('[data-next-mark]')
      if(!indicator) return
      window.showedBuilder = window.showedBuilder || (
        indicator.getAttribute('data-next-mark-loading') === 'true'
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 5)
  })()`)
}

describe('Build Activity Indicator', () => {
  // Use describe.skip so that this suite does not fail with "no tests" during deploy tests.
  ;(isNextStart ? describe : describe.skip)('Invalid position config', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, '..'),
      skipStart: true,
      startServerTimeout: 1000,
      nextConfig: {
        devIndicators: {
          // Intentionally invalid position to test error
          position: 'ttop-leff' as any,
        },
      },
    })

    it('should validate position config', async () => {
      const result = await next.build()

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        `Invalid "devIndicator.position" provided, expected one of top-left, top-right, bottom-left, bottom-right, received ttop-leff`
      )
    })
  })

  if (isNextDev) {
    describe.each(['pages', 'app'])('Enabled - (%s)', (pagesOrApp) => {
      const { next } = nextTestSetup({
        files: join(__dirname, '..'),
      })

      ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
        'webpack only',
        () => {
          it('Shows the build indicator when a page is built during navigation', async () => {
            const browser = await next.browser(
              pagesOrApp === 'pages' ? '/' : '/app'
            )
            await installCheckVisible(browser)
            await browser.elementByCss('#to-a').click()
            await retry(async () => {
              const wasVisible = await browser.eval('window.showedBuilder')
              expect(wasVisible).toBe(true)
            })
          })
        }
      )

      it('Shows build indicator when page is built from modifying', async () => {
        const browser = await next.browser(
          pagesOrApp === 'pages' ? '/b' : '/app/b'
        )
        await installCheckVisible(browser)
        const pagePath =
          pagesOrApp === 'pages' ? 'pages/b.js' : 'app/app/b/page.js'

        await next.patchFile(pagePath, (content) => content.replace('b', 'c'))

        await retry(async () => {
          const wasVisible = await browser.eval('window.showedBuilder')

          expect(wasVisible).toBe(true)
        })
      })
    })
  }
})

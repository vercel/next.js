/* eslint-env jest */
import { join } from 'path'
import { retry } from 'next-test-utils'
import { nextTestSetup, isNextDev, isNextDeploy } from 'e2e-utils'

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
      window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot;
      const statusElement = root.querySelector('[data-indicator-status]')
      const badge = root.querySelector('[data-next-badge]')
      const status = badge ? badge.getAttribute('data-status') : null

      // Check if we're showing any build/compile status
      window.showedBuilder = window.showedBuilder || (
        statusElement !== null || (status && status !== 'none')
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 5)
  })()`)
}

describe('Build Activity Indicator', () => {
  // Use describe.skip so that this suite does not fail with "no tests" during deploy tests.
  ;(isNextDeploy ? describe.skip : describe)('Invalid position config', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, '..'),
      skipStart: true,
      nextConfig: {
        devIndicators: {
          // Intentionally invalid position to test error
          // @ts-expect-error
          position: 'ttop-leff',
        },
      },
    })

    it('should validate position config', async () => {
      if (isNextDev) {
        try {
          await next.start()
        } catch (err) {
          expect(err).toEqual(
            new Error('next dev exited unexpectedly with code/signal 1')
          )
        }
      } else {
        const result = await next.build()
        expect(result.exitCode).toBe(1)
      }

      expect(next.cliOutput).toContain(
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

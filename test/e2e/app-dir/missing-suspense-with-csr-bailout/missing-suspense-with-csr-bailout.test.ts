import { FileRef, isNextDev, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('missing-suspense-with-csr-bailout', () => {
  if (isNextDev) {
    it.skip('skip test for development mode', () => {})
    return
  }

  const files = {
    'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
    'app/layout.js': new FileRef(join(__dirname, 'app/layout.js')),
    'app/dynamic': new FileRef(join(__dirname, 'app/dynamic')),
  }
  // The browser-bailout variant imports this suite with the flag enabled.
  // Forward it explicitly so remote builds use the same configuration.
  const env = {
    TEST_REACT_BROWSER_BAILOUT: process.env.TEST_REACT_BROWSER_BAILOUT || '0',
  }

  const isCacheComponentsEnabled =
    process.env.__NEXT_CACHE_COMPONENTS === 'true'

  describe('useSearchParams', () => {
    const message = isCacheComponentsEnabled
      ? 'https://nextjs.org/docs/messages/blocking-prerender-client-hook'
      : `useSearchParams() should be wrapped in a suspense boundary at page "/".`

    describe('without Suspense', () => {
      const { next } = nextTestSetup({
        files: {
          ...files,
          'app/page.js': new FileRef(join(__dirname, 'app/page.js')),
        },
        env,
        skipStart: true,
      })

      it('should fail build if useSearchParams is not wrapped in a suspense boundary', async () => {
        await expect(next.start()).rejects.toThrow()
        expect(next.cliOutput).toContain(message)
        expect(next.cliOutput).not.toContain(
          'The server render could not complete because client rendering was requested outside a Suspense boundary'
        )
        // Can show the trace where the searchParams hook is used
        // TODO: This path is different for Turbopack. Builds need to have sourcemaps support.
        if (!process.env.IS_TURBOPACK_TEST) {
          expect(next.cliOutput).toMatch(/at.*server[\\/]app[\\/]page.js/)
        }
      }, 240_000)
    })

    describe('with Suspense', () => {
      const { next } = nextTestSetup({
        files: {
          ...files,
          'app/layout.js': new FileRef(
            join(__dirname, 'app/layout-suspense.js')
          ),
          'app/page.js': new FileRef(join(__dirname, 'app/page.js')),
        },
        env,
      })

      it('should pass build if useSearchParams is wrapped in a suspense boundary', () => {
        expect(next.cliOutput).not.toContain(message)
      })
    })
  })

  describe('next/dynamic', () => {
    const { next } = nextTestSetup({
      files,
      env,
    })

    it('does not emit errors related to bailing out of client side rendering', async () => {
      const browser = await next.browser('/dynamic', {
        pushErrorAsConsoleLog: true,
      })

      try {
        await browser.waitForElementByCss('#dynamic')

        expect(await browser.log()).not.toContainEqual(
          expect.objectContaining({
            source: 'error',
          })
        )
      } finally {
        await browser.close()
      }
    })
  })
})

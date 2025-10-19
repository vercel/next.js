import { nextTestSetup } from 'e2e-utils'

describe('missing-suspense-with-csr-bailout', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // This test is skipped when deployed because it's not possible to rename files after deployment.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it.skip('skip test for development mode', () => {})
    return
  }

  beforeEach(async () => {
    await next.clean()
  })

  const isCacheComponentsEnabled =
    process.env.__NEXT_CACHE_COMPONENTS === 'true'

  describe('useSearchParams', () => {
    const message = isCacheComponentsEnabled
      ? `Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it. See more info: https://nextjs.org/docs/messages/next-prerender-missing-suspense`
      : `useSearchParams() should be wrapped in a suspense boundary at page "/".`

    it('should fail build if useSearchParams is not wrapped in a suspense boundary', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(next.cliOutput).toContain(message)
      // Can show the trace where the searchParams hook is used
      // TODO: This path is different for Turbopack. Builds need to have sourcemaps support.
      if (!process.env.IS_TURBOPACK_TEST) {
        expect(next.cliOutput).toMatch(/at.*server[\\/]app[\\/]page.js/)
      }
    })

    it('should pass build if useSearchParams is wrapped in a suspense boundary', async () => {
      await next.renameFile('app/layout.js', 'app/layout-no-suspense.js')
      await next.renameFile('app/layout-suspense.js', 'app/layout.js')

      await expect(next.build()).resolves.toEqual({
        exitCode: 0,
        cliOutput: expect.not.stringContaining(message),
      })

      await next.renameFile('app/layout.js', 'app/layout-suspense.js')
      await next.renameFile('app/layout-no-suspense.js', 'app/layout.js')
    })
  })

  describe('next/dynamic', () => {
    beforeEach(async () => {
      await next.renameFile('app/page.js', 'app/_page.js')
      await next.start()
    })
    afterEach(async () => {
      await next.renameFile('app/_page.js', 'app/page.js')
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

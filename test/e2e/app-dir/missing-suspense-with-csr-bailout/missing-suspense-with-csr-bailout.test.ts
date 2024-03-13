import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'missing-suspense-with-csr-bailout',
  {
    files: __dirname,
    skipStart: true,
  },
  ({ next, isNextDev }) => {
    if (isNextDev) {
      it.skip('skip test for dev mode', () => {})
      return
    }

    beforeEach(async () => {
      await next.clean()
    })

    describe('useSearchParams', () => {
      const message = `useSearchParams() should be wrapped in a suspense boundary at page "/".`

      it('should fail build if useSearchParams is not wrapped in a suspense boundary', async () => {
        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(message)
        // Can show the trace where the searchParams hook is used
        expect(next.cliOutput).toMatch(/at.*server[\\/]app[\\/]page.js/)
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

      it('should pass build if missingSuspenseWithCSRBailout os set to false', async () => {
        let _content
        await next.patchFile('next.config.js', (content) => {
          _content = content
          return content.replace(
            '{}',
            '{ experimental: { missingSuspenseWithCSRBailout: false } }'
          )
        })

        const result = await next.build()
        expect(result.exitCode).toBe(0)
        expect(result.cliOutput).toMatch(
          '⚠ Entire page "/" deopted into client-side rendering due to "useSearchParams()". Read more: https://nextjs.org/docs/messages/deopted-into-client-rendering'
        )
        expect(result.cliOutput).toMatch(/app\/page\.js:\d+:\d+/)

        await next.patchFile('next.config.js', _content)
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
  }
)

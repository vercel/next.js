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

      it('should pass build if useSearchParams is wrapped in a suspense boundary', async () => {
        await expect(next.build()).resolves.toEqual({
          exitCode: 0,
          cliOutput: expect.not.stringContaining(message),
        })
      })

      it('should fail build if useSearchParams is not wrapped in a suspense boundary', async () => {
        await next.renameFile('app/layout.js', 'app/layout-suspense.js')
        await next.renameFile('app/layout-no-suspense.js', 'app/layout.js')

        await expect(next.build()).resolves.toEqual({
          exitCode: 1,
          cliOutput: expect.stringContaining(message),
        })

        await next.renameFile('app/layout.js', 'app/layout-no-suspense.js')
        await next.renameFile('app/layout-suspense.js', 'app/layout.js')
      })
    })

    describe('next/dynamic', () => {
      beforeEach(async () => {
        await next.start()
      })

      it('does not emit errors related to bailing out of client side rendering', async () => {
        const browser = await next.browser('/dynamic', {
          pushErrorAsConsoleLog: true,
        })

        try {
          await browser.waitForElementByCss('#dynamic')

          // await new Promise((resolve) => setTimeout(resolve, 1000))

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

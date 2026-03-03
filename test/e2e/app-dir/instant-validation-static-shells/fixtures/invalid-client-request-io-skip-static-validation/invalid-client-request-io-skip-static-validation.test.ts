import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'

describe('invalid-client-request-io-skip-static-validation', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  if (isNextDev) {
    beforeAll(() => next.start())

    it('does not error during instant validation if client request IO without a Suspense boundary', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })
  } else {
    it('errors during build if client request IO without a Suspense boundary', async () => {
      const { cliOutput, exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        'Render in Browser should be wrapped in a suspense boundary at page'
      )
    })
  }
})

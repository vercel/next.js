import { nextTestSetup } from 'e2e-utils'
import { waitForNoErrorToast } from 'next-test-utils'

describe('instant-static-shell-validation-sync-io', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  if (isNextDev) {
    beforeAll(() => next.start())

    it('does not require a static shell if a root layouts is configured as blocking', async () => {
      const browser = await next.browser('/valid')
      await browser.elementByCss('main')
      await waitForNoErrorToast(browser)
    })

    it('detects sync IO in client component when entire tree is new', async () => {
      const browser = await next.browser('/sync-io-page-below-static-layout')
      await expect(browser).toDisplayCollapsedRedbox(`"Redbox did not open."`)
    })
  } else {
    it('errors during build', async () => {
      const { cliOutput, exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain('Date.now()')
    })
  }
})

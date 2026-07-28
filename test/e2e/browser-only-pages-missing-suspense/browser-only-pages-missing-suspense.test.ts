import { isReact18, nextTestSetup } from 'e2e-utils'
import { getRedboxDescription, waitForRedbox } from 'next-test-utils'

describe('browserOnly without Suspense in the Pages Router', () => {
  if (isReact18) {
    it.skip('requires React 19 or later', () => {})
    return
  }

  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('shows a redbox', async () => {
      await next.start()

      const browser = await next.browser('/')
      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toContain(
        'Bail out to client-side rendering: browserOnly()'
      )
    })
  } else {
    it('fails the build', async () => {
      const result = await next.build()

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        'browserOnly() should be wrapped in a Suspense boundary'
      )
    })
  }
})

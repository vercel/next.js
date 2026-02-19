import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  getRedboxSource,
  retry,
  waitForRedbox,
} from 'next-test-utils'

describe('unstable-instant-client-error', () => {
  const { next, skipped, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error when unstable_instant is exported from a client component', async () => {
    const webpackExpectedError =
      'Page "/page" cannot use both "use client" and `export const unstable_instant = ...`.'
    const turbopackExpectedError =
      'Next.js can\'t recognize the exported `unstable_instant` field in route. App pages cannot use both "use client" and export const "unstable_instant".'

    try {
      await next.start()
    } catch {
      // Expected: build/start should fail in this fixture.
    }

    if (isNextDev) {
      if (isTurbopack) {
        return
      }

      const browser = await next.browser('/')
      await waitForRedbox(browser)
      const description = await getRedboxDescription(browser)
      const source = await getRedboxSource(browser)

      expect(`${description}\n${source ?? ''}`).toContain(webpackExpectedError)
    } else {
      const expectedError = isTurbopack
        ? turbopackExpectedError
        : webpackExpectedError

      await retry(async () => {
        expect(next.cliOutput).toContain(expectedError)
      })
    }
  })
})

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
    const hardPageExpectedError =
      'Page "/hard/page" cannot use both "use client" and `export const unstable_instant = ...`.'
    const softPageExpectedError =
      'Page "/soft/page" cannot use both "use client" and `export const unstable_instant = ...`.'

    try {
      await next.start()
    } catch {
      // Expected: build/start should fail in this fixture.
    }

    if (isNextDev) {
      if (isTurbopack) {
        return
      }

      const hardNavBrowser = await next.browser('/hard')
      await waitForRedbox(hardNavBrowser)
      const hardNavDescription = await getRedboxDescription(hardNavBrowser)
      const hardNavSource = await getRedboxSource(hardNavBrowser)
      expect(`${hardNavDescription}\n${hardNavSource ?? ''}`).toContain(
        hardPageExpectedError
      )

      const browser = await next.browser('/')
      await browser.elementByCss('#soft-link').click()
      await waitForRedbox(browser)
      const description = await getRedboxDescription(browser)
      const source = await getRedboxSource(browser)
      expect(`${description}\n${source ?? ''}`).toContain(softPageExpectedError)
    } else {
      await retry(async () => {
        expect(
          next.cliOutput.includes(hardPageExpectedError) ||
            next.cliOutput.includes(softPageExpectedError)
        ).toBe(true)
      })
    }
  })
})

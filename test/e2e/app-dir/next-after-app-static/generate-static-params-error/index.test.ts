/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
} from '../../../../lib/next-test-utils'

describe('after() in generateStaticParams - thrown errors', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true, // can't access build errors in deploy tests
  })

  if (skipped) return

  if (isNextDev) {
    it('shows the error overlay if an error is thrown inside after', async () => {
      await next.start()
      const browser = await next.browser('/callback/1')
      await assertHasRedbox(browser)
      const route = '/callback/[myParam]'
      expect(await getRedboxDescription(browser)).toContain(
        `My cool error thrown inside after on route "${route}"`
      )
    })
  } else {
    it('fails the build if an error is thrown inside after', async () => {
      const buildResult = await next.build()
      expect(buildResult?.exitCode).toBe(1)

      const route = '/callback/[myParam]'
      expect(next.cliOutput).toContain(
        `Failed to collect page data for ${route}`
      )
      expect(next.cliOutput).toContain(
        `My cool error thrown inside after on route "${route}"`
      )
    })
  }
})

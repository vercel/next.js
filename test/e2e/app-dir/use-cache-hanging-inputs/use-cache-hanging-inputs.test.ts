import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxDescription,
  getRedboxSource,
  openRedbox,
  waitFor,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('use-cache-hanging-inputs', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should show an error toast after a timeout', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/?n=1')

      // The request is pending while we stall on the hanging inputs, and
      // playwright will wait for the load even before continuing. So we don't
      // need to wait for the "use cache" timeout of 50 seconds here.

      await openRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toMatchInlineSnapshot(
        `"[ Cache ] Error: Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache"."`
      )

      // TODO(veil): This should have an error source if the source mapping works.
      expect(errorSource).toMatchInlineSnapshot(`null`)

      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

      // TODO(veil): Should include properly source mapped stack frames.
      expect(cliOutput).toContain(
        isTurbopack
          ? `
Error: Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".
    at [project]/app/page.tsx [app-rsc] (ecmascript)`
          : `
Error: Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".
    at eval (webpack-internal:///(rsc)/./app/page.tsx:16:97)`
      )
    }, 180_000)
  } else {
    it('should fail the build with an error after a timeout', async () => {
      const { cliOutput } = await next.build()

      // Wait for the "use cache" timeout of 50 seconds.
      await waitFor(50000)

      expect(cliOutput).toInclude(
        'Error: Filling a cache during prerender timed out, likely because request-specific arguments such as params, searchParams, cookies() or dynamic data were used inside "use cache".'
      )

      expect(cliOutput).toInclude('Error occurred prerendering page "/"')
    }, 180_000)
  }
})

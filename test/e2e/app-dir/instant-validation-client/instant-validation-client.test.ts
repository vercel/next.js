import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('app dir - instant-validation-client', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when a client component exports instant', async () => {
    const expectedErrMsg = `"instant" is a route segment config and can only be used when the segment is a Server Component module. Remove the "use client" directive`

    if (isNextDev) {
      await next.start().catch(() => {})
      await next.browser('/').catch(() => {})
      await retry(async () => {
        expect(next.cliOutput).toContain(expectedErrMsg)
      })
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(expectedErrMsg)
    }
  })
})

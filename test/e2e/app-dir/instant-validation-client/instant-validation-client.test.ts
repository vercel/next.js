import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// This suite runs next.build() to inspect build output or errors.
// Deploy mode requires a successful deployment and cannot run these local builds.
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

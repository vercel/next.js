import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('proxy-with-middleware', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when both middleware and proxy files are detected', async () => {
    const message =
      'Both middleware file "./middleware.ts" and proxy file "./proxy.ts" are detected. Please use "./proxy.ts" only.'

    if (isNextDev) {
      await next.start().catch(() => {})
      await retry(async () => {
        expect(next.cliOutput).toContain(message)
      })
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(message)
    }
  })
})

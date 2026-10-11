import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// Webpack-specific test, not needed for Turbopack
// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
// @force-gate !turbopack
describe('undefined webpack config error', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    it.skip('should show in production mode', async () => {
      const { cliOutput } = await next.build()
      expect(cliOutput).toMatch(expectedErr)
    })
  })
  ;(isNextDev ? it : it.skip)(
    'should show error in development mode',
    async () => {
      await next.start()
      await retry(async () => {
        expect(next.cliOutput).toMatch(expectedErr)
      })
    }
  )
})

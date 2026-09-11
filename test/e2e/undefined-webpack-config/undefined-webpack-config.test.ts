import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// Webpack-specific test, not needed for Turbopack
// This scope deliberately triggers compiler or configuration errors and checks diagnostics.
// The deploy harness requires a successful build before test assertions can run.
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

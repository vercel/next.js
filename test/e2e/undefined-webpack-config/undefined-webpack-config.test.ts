import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// Webpack-specific test, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'undefined webpack config error',
  () => {
    const { next, isNextDev, isNextStart, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
      // It likely asserts local CLI or runtime output that deploy tests do not expose.
      skipDeployment: true,
    })
    if (skipped) return
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
  }
)

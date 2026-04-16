import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const expectedErr =
  /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/

// Webpack-specific test, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'undefined webpack config error',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it.skip('should show in production mode', async () => {
          // Original test used nextBuild; in nextTestSetup context, build output
          // is available via next.cliOutput in production mode
          expect(next.cliOutput).toMatch(expectedErr)
        })
      }
    )

    it('should show error in development mode', async () => {
      await retry(async () => {
        expect(next.cliOutput).toMatch(expectedErr)
      })
    })
  }
)

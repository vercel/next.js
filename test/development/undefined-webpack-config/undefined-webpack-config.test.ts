import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Webpack-specific test, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'undefined webpack config error',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should show error in development mode', async () => {
      await retry(async () => {
        expect(next.cliOutput).toMatch(
          /Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js/
        )
      })
    })
  }
)

import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Invalid resolve alias',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should show relevant error when webpack resolve alias is wrong', async () => {
      await next.build()

      expect(next.cliOutput).toMatch(
        'webpack config.resolve.alias was incorrectly overridden. https://'
      )
    })
  }
)

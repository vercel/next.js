import { nextTestSetup } from 'e2e-utils'

// Skipped for Turbopack as this test is webpack-specific
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Handles a broken webpack plugin (precompile)',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should render error correctly', async () => {
      const text = await next.render('/')
      expect(text).toContain('Internal Server Error')
      expect(next.cliOutput).toMatch('Error: oops')
    })
  }
)

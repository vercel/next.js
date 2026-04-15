import { nextTestSetup } from 'e2e-utils'

// Webpack-specific test, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Handles Webpack Require Hook',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should apply webpack require hook', async () => {
      await next.render('/')
      expect(next.cliOutput).toMatch(/Initialized config/)
    })
  }
)

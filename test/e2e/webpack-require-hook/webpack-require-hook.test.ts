import { nextTestSetup, isNextStart } from 'e2e-utils'

// Webpack-specific test, not needed for Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Handles Webpack Require Hook',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    if (isNextStart) {
      it('should not error during build', () => {
        const errors = next.cliOutput
          .split('\n')
          .filter((line) => line && !line.trim().startsWith('⚠'))
          .filter((line) => /\bError\b/.test(line))
        expect(errors).toEqual([])
        expect(next.cliOutput).toMatch(/Initialized config/)
      })
    }

    ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
      'development mode',
      () => {
        it('should apply and not error during development', async () => {
          await next.render('/')
          expect(next.cliOutput).toMatch(/Initialized config/)
        })
      }
    )
  }
)

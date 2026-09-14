import { nextTestSetup } from 'e2e-utils'

// Skip webpack specific test in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Customized webpack config with main.js',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should run correctly with main.js customized', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })
  }
)

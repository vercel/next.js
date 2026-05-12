import { nextTestSetup } from 'e2e-utils'

// Skip webpack specific test in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'webpack config with extensionAlias setting',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should run correctly with an tsx file import with .js extension', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })
  }
)

import { nextTestSetup } from 'e2e-utils'

describe('Polyfilling (minimal)', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('should compile successfully', async () => {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(0)
        expect(cliOutput).toMatch(/Compiled successfully/)
      })
    }
  )
})

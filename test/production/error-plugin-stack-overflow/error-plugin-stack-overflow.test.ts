import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Reports stack trace when webpack plugin stack overflows',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('shows details in next build', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      expect(next.cliOutput).toContain(
        'caused by plugins in Compilation.hooks.processAssets'
      )
      expect(next.cliOutput).toContain('Maximum call stack size exceeded')
      expect(next.cliOutput).toContain('next.config.js:7')
    })
  }
)

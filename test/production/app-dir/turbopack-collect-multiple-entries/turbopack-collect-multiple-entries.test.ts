import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-collect-multiple-entries',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('fails when a collecting module is shared between entries', async () => {
      const { exitCode, cliOutput } = await next.build()

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain('Invalid use of __turbopack_collect__')
      expect(cliOutput).toContain(
        'must not be reachable from multiple entry chunk groups'
      )
    })
  }
)

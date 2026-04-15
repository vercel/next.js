import { nextTestSetup } from 'e2e-utils'
;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
  'Production Usage without production build',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should show error when there is no production build', async () => {
      await next.start({ skipBuild: true }).catch(() => {})
      expect(next.cliOutput).toMatch(/Could not find a production build in the/)
    })
  }
)

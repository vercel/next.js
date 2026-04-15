import { nextTestSetup } from 'e2e-utils'

const describeProd = process.env.TURBOPACK_DEV ? describe.skip : describe

describeProd('Invalid Prerender Catchall Params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  describe('production mode', () => {
    it('should fail the build', async () => {
      const out = await next.build()
      expect(out.cliOutput).toMatch(`Build error occurred`)
      expect(out.cliOutput).toMatch(
        'A required parameter (slug) was not provided as an array received string in getStaticPaths for /[...slug]'
      )
    })
  })
})

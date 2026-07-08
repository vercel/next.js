import { nextTestSetup } from 'e2e-utils'

describe('Invalid Prerender Array Element Params', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  describe('production mode', () => {
    it('should fail the build with array element type error', async () => {
      const out = await next.build()
      expect(out.cliOutput).toMatch(`Build error occurred`)
      expect(out.cliOutput).toMatch(
        'Parameter "slug[1]" from getStaticPaths for /[...slug] must be a string, but received number (123)'
      )
    })
  })
})

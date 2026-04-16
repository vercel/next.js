import { nextTestSetup } from 'e2e-utils'

describe('Invalid Prerender Catchall Params', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isNextStart) {
    it('skipped for non-start mode', () => {})
    return
  }

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

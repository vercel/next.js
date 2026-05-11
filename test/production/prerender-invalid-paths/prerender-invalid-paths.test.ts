import { nextTestSetup } from 'e2e-utils'

describe('Legacy Prerender', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      skipStart: true,
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    describe('handles old getStaticParams', () => {
      it('should fail the build', async () => {
        const { cliOutput } = await next.build()
        expect(cliOutput).toMatch(`Build error occurred`)
        expect(cliOutput).toMatch('Additional keys were returned from')
        expect(cliOutput).toMatch('return { params: { foo: ..., post: ... } }')
        expect(cliOutput).toMatch('Keys that need to be moved: foo, baz.')
      })
    })
  })
})

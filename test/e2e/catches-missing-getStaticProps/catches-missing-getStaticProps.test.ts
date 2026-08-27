import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('Catches Missing getStaticProps', () => {
  const errorRegex = /getStaticPaths was added without a getStaticProps in/

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: isNextStart,
    // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
    // It likely asserts local CLI or runtime output that deploy tests do not expose.
    skipDeployment: true,
  })

  if (isNextDev) {
    it('should catch it in development mode', async () => {
      const html = await next.render('/hello')
      expect(html).toMatch(errorRegex)
    })
  }

  if (isNextStart) {
    it('should catch it in server build mode', async () => {
      const { cliOutput } = await next.build()
      expect(cliOutput).toMatch(errorRegex)
    })
  }
})

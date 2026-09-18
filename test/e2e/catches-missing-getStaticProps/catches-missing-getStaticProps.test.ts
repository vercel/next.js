import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
;((isNextDev && process.env.TURBOPACK_BUILD) ||
  (isNextStart && process.env.TURBOPACK_DEV)
  ? describe.skip
  : describe)('Catches Missing getStaticProps', () => {
  const errorRegex = /getStaticPaths was added without a getStaticProps in/

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
  })

  if (isNextDev) {
    it('should catch it in development mode', async () => {
      const html = await next.render('/hello')
      expect(html).toMatch(errorRegex)
    })
  }

  if (!isNextDev) {
    it('should catch it in server build mode', async () => {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toMatch(errorRegex)
    }, 240_000)
  }
})

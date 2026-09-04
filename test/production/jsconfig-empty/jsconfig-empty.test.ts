import { nextTestSetup } from 'e2e-utils'

describe('Empty JSConfig Support', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should compile successfully', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(0)
      expect(cliOutput).toMatch(/Compiled successfully/)
    })
  })
})

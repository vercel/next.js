import { nextTestSetup } from 'e2e-utils'

describe('TypeScript filtered files', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should fail to build the app with a file named con*test*.js', async () => {
      const { exitCode } = await next.build()
      expect(next.cliOutput).not.toMatch(/Compiled successfully/)
      expect(exitCode).toBe(1)
      expect(next.cliOutput).toMatch(/Failed to type check/)
      expect(next.cliOutput).toMatch(/is not assignable to type 'boolean'/)
    })
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('Empty JSConfig Support', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('should compile successfully', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(0)
      expect(cliOutput).toMatch(/Compiled successfully/)
    })
  })
})

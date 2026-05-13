import { nextTestSetup } from 'e2e-utils'

describe('app-dynamic-error', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('throws an error when prerendering a page with config dynamic error', async () => {
      const { exitCode } = await next.build()
      expect(next.cliOutput).toContain(
        'Error occurred prerendering page "/dynamic-error"'
      )
      expect(exitCode).toBe(1)
    })
  })
})

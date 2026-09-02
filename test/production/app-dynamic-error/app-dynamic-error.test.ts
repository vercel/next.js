import { nextTestSetup } from 'e2e-utils'

describe('app-dynamic-error', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('throws an error when prerendering a page with config dynamic error', async () => {
      const { exitCode } = await next.build()
      expect(next.cliOutput).toContain(
        'Error occurred prerendering page "/dynamic-error"'
      )
      expect(exitCode).toBe(1)
    })
  })
})

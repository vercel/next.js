import { nextTestSetup } from 'e2e-utils'

const warnMessage = /Using tsconfig file:/

describe('Custom TypeScript Config', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  // @force-gate !turbopack
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should warn when using custom typescript path', async () => {
      await next.build()
      expect(next.cliOutput).toMatch(warnMessage)
    })
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('Numeric Separator Support', () => {
  // This scope only checks compiler output for a numeric-separator build regression.
  // It belongs to local build validation and has no deployed runtime assertion.
  // @force-gate !deploy
  describe('production mode', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should successfully build for a JavaScript file', async () => {
      expect(next.cliOutput).toContain('Compiled successfully')
      expect(next.cliOutput).not.toContain('Failed to compile')
    })
  })
})

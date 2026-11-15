import { nextTestSetup } from 'e2e-utils'

describe('Numeric Separator Support', () => {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // No deploy-specific incompatibility is documented.
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

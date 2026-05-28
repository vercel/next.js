import { nextTestSetup } from 'e2e-utils'

describe('Numeric Separator Support', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    it('should successfully build for a JavaScript file', async () => {
      expect(next.cliOutput).toContain('Compiled successfully')
      expect(next.cliOutput).not.toContain('Failed to compile')
    })
  })
})

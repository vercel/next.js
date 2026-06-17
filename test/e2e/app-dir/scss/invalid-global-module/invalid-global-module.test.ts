/* eslint-env jest */

import { isNextStart, nextTestSetup } from 'e2e-utils'

describe.skip('Invalid CSS Global Module Usage in node_modules', () => {
  ;(isNextStart ? describe : describe.skip)('production only', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should fail to build', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('Failed to compile')
      expect(cliOutput).toContain('node_modules/example/index.scss')
      expect(cliOutput).toMatch(
        /Global CSS.*cannot.*be imported from within.*node_modules/
      )
      // Skip: Rspack loaders cannot access module issuer info for location details
      if (!process.env.NEXT_RSPACK) {
        expect(cliOutput).toMatch(
          /Location:.*node_modules[\\/]example[\\/]index\.mjs/
        )
      }
    })
  })
})

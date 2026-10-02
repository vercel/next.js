/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

// This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
// @force-gate !deploy
// @force-gate TODO
describe('Invalid CSS Module Usage in node_modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should fail to build', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).not.toBe(0)
    expect(cliOutput).toContain('Failed to compile')
    expect(cliOutput).toContain('node_modules/example/index.module.scss')
    expect(cliOutput).toMatch(
      /CSS Modules.*cannot.*be imported from within.*node_modules/
    )
    // Skip: Rspack loaders cannot access module issuer info for location details
    if (!process.env.NEXT_RSPACK) {
      expect(cliOutput).toMatch(
        /Location:.*node_modules[\\/]example[\\/]index\.mjs/
      )
    }
  })
})

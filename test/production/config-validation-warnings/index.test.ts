import { nextTestSetup } from 'e2e-utils'

describe('config validation - warnings only', () => {
  const { next } = nextTestSetup({
    skipStart: true,
    skipDeployment: true,
    files: __dirname,
  })

  it('should show warnings but not block the build', async () => {
    const { exitCode, cliOutput } = await next.build()

    // Build should succeed
    expect(exitCode).toBe(0)

    // Should show warnings
    expect(cliOutput).toContain('Invalid next.config.js options detected')
    expect(cliOutput).toContain(
      "Unrecognized key(s) in object: 'unknownExperimentalOption', 'anotherUnknownOption'"
    )
    expect(cliOutput).toContain('at "experimental"')

    // Should NOT show fatal error message
    expect(cliOutput).not.toContain('Fatal next config errors')

    // Build should complete successfully
    expect(cliOutput).toContain('Compiled successfully')
  })
})

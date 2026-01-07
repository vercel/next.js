import { nextTestSetup } from 'e2e-utils'

describe('config validation - fatal errors', () => {
  const { next } = nextTestSetup({
    skipStart: true,
    skipDeployment: true,
    files: __dirname,
  })

  it('should show warnings first, then throw fatal error', async () => {
    const { exitCode, cliOutput } = await next.build()

    // Build should fail
    expect(exitCode).toBe(1)

    // Should show warnings first
    expect(cliOutput).toContain('Invalid next.config.js options detected')
    expect(cliOutput).toContain(
      "Unrecognized key(s) in object: 'unknownExperimentalOption', 'anotherUnknownOption'"
    )
    expect(cliOutput).toContain('at "experimental"')

    // Should show fatal error
    expect(cliOutput).toContain(
      'Fatal next config errors found in next.config.js that must be fixed'
    )
    expect(cliOutput).toContain(
      "Unrecognized key(s) in object: 'invalidOption'"
    )
    expect(cliOutput).toContain('at "images"')
    expect(cliOutput).toContain(
      'These configuration options are required or have been migrated'
    )
  })
})

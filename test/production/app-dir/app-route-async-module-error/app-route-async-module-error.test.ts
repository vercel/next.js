import { nextTestSetup } from 'e2e-utils'

describe('app-route-async-module-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // The route module uses top-level await, so the error rejects the module
  // promise instead of throwing during require(). It must still fail the
  // build.
  it('fails the build when an async route module rejects', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).toContain('Kaboom')
    expect(exitCode).toBe(1)
  })
})

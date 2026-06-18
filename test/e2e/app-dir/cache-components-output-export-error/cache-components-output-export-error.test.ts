import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('cache-components-output-export-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  it('fails the build, naming the route, when a route cannot be fully prerendered', async () => {
    if (!isNextStart) {
      // The enforcement is a build-time concern; nothing to assert in dev.
      return
    }

    const { exitCode, cliOutput } = await next.build()

    expect(cliOutput).toContain(
      'Route "/dynamic-route" could not be statically exported because it uses dynamic or uncached data.'
    )
    expect(exitCode).toBe(1)
  })
})

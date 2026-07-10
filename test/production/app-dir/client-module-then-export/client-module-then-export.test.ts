import { nextTestSetup } from 'e2e-utils'

describe('client-module-then-export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // A client module that exports a function named `then` has thenable
  // exports, even though it is not an async module. The client page's module
  // getter yields a client reference proxy on the server.
  it('builds pages that render client modules that export `then`', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('took more than')
    expect(exitCode).toBe(0)
  })
})

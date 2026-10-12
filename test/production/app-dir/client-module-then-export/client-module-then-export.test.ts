import { nextTestSetup } from 'e2e-utils'

describe('client-module-then-export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // A client module that exports a function named `then` has thenable
  // exports, even though it is not an async module. If module tracking
  // mistakes it for a pending async module, awaiting it calls the `then`
  // export instead of settling, and the build hangs in the cache warming
  // phase. A module whose exports object literally is a promise
  // (promise-exports.js) must not hang the build either, even though the
  // promise never settles.
  it('builds pages that render client modules that export `then`', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})

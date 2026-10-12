import { nextTestSetup } from 'e2e-utils'

describe('app-route-then-export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // A module that exports a function named `then` is not an async module,
  // even though the exports object is thenable.
  it('builds and serves a route handler that exports `then`', async () => {
    const res = await next.fetch('/api/thenable')
    expect(await res.json()).toEqual({ ok: true })
  })
})

import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely controls the local Next.js build or server lifecycle.
// @force-gate !deploy
describe('api-resolver-query-writeable', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /Next mode: (production|development)/,
    dependencies: {
      'get-port': '5.1.1',
      express: '5.1.0',
    },
  })

  it('should allow req.query to be writable and reflect changes made in the API handler', async () => {
    const res = await next.fetch('/api?hello=yes', {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
    if (!res.ok) {
      throw new Error('Fetch failed')
    }
    const data = await res.json()
    expect(data).toEqual({ query: { hello: 'yes', changed: 'yes' } })
  })
})

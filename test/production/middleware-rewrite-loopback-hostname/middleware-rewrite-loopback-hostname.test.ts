import { nextTestSetup } from 'e2e-utils'

describe('middleware rewrite with a loopback hostname', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startArgs: ['-H', '127.0.0.1'],
  })

  it('keeps the rewrite internal when HTTPS is forwarded', async () => {
    const res = await next.fetch('/a', {
      headers: {
        'x-forwarded-proto': 'https',
      },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('rewritten-b')
    expect(next.cliOutput).not.toContain('Failed to proxy')
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('middleware-basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const header = 'X-From-Middleware'

  it('loads a middleware', async () => {
    const response = await next.fetch('/post-1')
    expect(response.headers.has(header)).toBe(true)
  })
})

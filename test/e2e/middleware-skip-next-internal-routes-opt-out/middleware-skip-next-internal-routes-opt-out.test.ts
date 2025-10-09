import { nextTestSetup } from 'e2e-utils'

describe('middleware skip Next.js internal routes (opt-out)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should execute middleware on regular routes', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-executed')).toBe('true')
  })

  it('should ALSO execute middleware on _next routes when opted out', async () => {
    const res = await next.fetch('/_next/static/chunks/webpack.js')
    expect(res.headers.get('x-middleware-executed')).toBe('true')
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('middleware skip Next.js internal routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should execute middleware on regular routes', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-executed')).toBe('true')
  })

  it('should NOT execute middleware on _next routes', async () => {
    const res = await next.fetch('/_next/static/chunks/webpack.js')
    expect(res.headers.get('x-middleware-executed')).toBeFalsy()
  })
})

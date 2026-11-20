import { nextTestSetup } from 'e2e-utils'

describe('edge-x-middleware-set-cookie', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('omits the internal header on an app router edge route handler', async () => {
    const res = await next.fetch('/api/app/edge')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-set-cookie')).toBeNull()
    expect(res.headers.get('set-cookie')).toMatch(
      /app-edge=dummy-http-only-marker.*HttpOnly/i
    )
  })

  it('omits the internal header on a pages router edge api route', async () => {
    const res = await next.fetch('/api/pages/edge')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-set-cookie')).toBeNull()
    expect(res.headers.get('set-cookie')).toMatch(
      /pages-edge=dummy-http-only-marker.*HttpOnly/i
    )
  })

  it('omits the internal header on a nodejs route handler', async () => {
    const res = await next.fetch('/api/app/node')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-set-cookie')).toBeNull()
    expect(res.headers.get('set-cookie')).toMatch(
      /app-node=dummy-http-only-marker.*HttpOnly/i
    )
  })
})

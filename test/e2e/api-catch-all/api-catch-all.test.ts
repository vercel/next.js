import { nextTestSetup } from 'e2e-utils'
// TODO(deploy-test-completion): Assertions may differ from a local Next.js
// server when deployed.
// @force-gate !deploy
describe('API routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return data when catch-all', async () => {
    const res = await next.fetch('/api/users/1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      route: 'users',
      query: { slug: ['1'] },
    })
  })

  it('should return redirect when catch-all with index and trailing slash', async () => {
    const res = await next.fetch('/api/users/', {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)
    const text = await res.text()
    expect(text).toEqual('/api/users')
  })

  it('should return data when catch-all with index and trailing slash', async () => {
    const res = await next.fetch('/api/users/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ route: 'users', query: {} })
  })

  it('should return data when catch-all with index and no trailing slash', async () => {
    const res = await next.fetch('/api/users')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ route: 'users', query: {} })
  })
})

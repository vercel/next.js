import { nextTestSetup } from 'e2e-utils'
// TODO(deploy-test-completion): Assertions may differ from a local Next.js
// server when deployed.
// @force-gate !deploy
// @force-gate !start || !turbopackDev
describe('API routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return data when catch-all', async () => {
    const data = await next
      .fetch('/api/users/1', {})
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ slug: ['1'] })
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
    const data = await next
      .fetch('/api/users/', {})
      .then((res) => res.ok && res.json())

    expect(data).toEqual({})
  })

  it('should return data when catch-all with index and no trailing slash', async () => {
    const data = await next
      .fetch('/api/users', {})
      .then((res) => res.ok && res.json())

    expect(data).toEqual({})
  })
})

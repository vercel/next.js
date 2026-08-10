import { nextTestSetup } from 'e2e-utils'

describe('Route index handling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Pages-router `/index` route resolution differs in Vercel's deploy
    // infrastructure; these assertions are local-only.
    skipDeployment: true,
  })

  it('should handle / correctly', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /index correctly', async () => {
    const res = await next.fetch('/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from index')
  })

  it('should handle /index/index correctly', async () => {
    const res = await next.fetch('/index/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /index/?bar%60%3C%25%22%27%7B%24%2A%25%5C correctly', async () => {
    const res = await next.fetch('/index/?bar%60%3C%25%22%27%7B%24%2A%25%5C')
    expect(res.status).toBe(200)
  })

  it('should handle /index?file%3A%5C correctly', async () => {
    const res = await next.fetch('/index?file%3A%5C')
    expect(res.status).toBe(200)
  })
})

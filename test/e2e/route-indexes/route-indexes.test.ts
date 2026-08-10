import { nextTestSetup } from 'e2e-utils'

describe('Route indexes handling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Pages-router `/index` route resolution differs in Vercel's deploy
    // infrastructure; these assertions are local-only.
    skipDeployment: true,
  })

  it('should handle / correctly', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from index')
  })

  it('should handle /index correctly', async () => {
    const res = await next.fetch('/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /index/index correctly', async () => {
    const res = await next.fetch('/index/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /nested-index correctly', async () => {
    const res = await next.fetch('/nested-index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /nested-index/index correctly', async () => {
    const res = await next.fetch('/nested-index/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from nested index')
  })

  it('should handle /nested-index/index/index correctly', async () => {
    const res = await next.fetch('/nested-index/index/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /sub correctly', async () => {
    const res = await next.fetch('/sub')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from sub index')
  })

  it('should handle /sub/index correctly', async () => {
    const res = await next.fetch('/sub/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from sub id')
  })

  it('should handle /sub/index/index correctly', async () => {
    const res = await next.fetch('/sub/index/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /sub/another correctly', async () => {
    const res = await next.fetch('/sub/another')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from sub id')
  })

  it('should handle /sub/another/index correctly', async () => {
    const res = await next.fetch('/sub/another/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /api/sub correctly', async () => {
    const res = await next.fetch('/api/sub')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi from sub index')
  })

  it('should handle /api/sub/index correctly', async () => {
    const res = await next.fetch('/api/sub/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi from sub id')
  })

  it('should handle /api/sub/index/index correctly', async () => {
    const res = await next.fetch('/api/sub/index/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /api/sub/another correctly', async () => {
    const res = await next.fetch('/api/sub/another')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi from sub id')
  })

  it('should handle /api/sub/another/index correctly', async () => {
    const res = await next.fetch('/api/sub/another/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })
})

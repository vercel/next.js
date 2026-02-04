import { nextTestSetup } from 'e2e-utils'

describe('experimental.devCacheControlNoCache disabled (default)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use no-store for pages router by default', async () => {
    const res = await next.fetch('/pages-route')
    expect(res.headers.get('Cache-Control')).toBe('no-store, must-revalidate')
  })

  it('should use no-store for app router by default', async () => {
    const res = await next.fetch('/app-route')
    expect(res.headers.get('Cache-Control')).toBe('no-store, must-revalidate')
  })
})

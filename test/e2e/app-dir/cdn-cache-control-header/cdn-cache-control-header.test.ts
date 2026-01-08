import { nextTestSetup } from 'e2e-utils'

describe('cdn-cache-control-header', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDeploy) {
    it('should skip for deploy', () => {})
    return
  }

  it('should use custom CDN cache control header name from experimental config', async () => {
    const res = await next.fetch('/')

    // In dev mode, no caching headers are set
    if (isNextDev) {
      expect(res.headers.get('cache-control')).toBe('no-store, must-revalidate')
      expect(res.headers.get('surrogate-control')).toBeNull()
      expect(res.headers.get('cdn-cache-control')).toBeNull()
      return
    }

    expect(res.headers.get('cache-control')).toBe('s-maxage=60')
    expect(res.headers.get('surrogate-control')).toMatch(/^max-age=\d+/)
    expect(res.headers.get('cdn-cache-control')).toBeNull()
  })
})

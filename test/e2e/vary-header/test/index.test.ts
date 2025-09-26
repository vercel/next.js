import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('Vary Header Tests', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, '../app'),
    skipDeployment: true,
  })

  it('should preserve custom vary header in API routes', async () => {
    const res = await next.fetch('/api/custom-vary')
    expect(res.headers.get('vary')).toContain('Custom-Header')
  })

  it('should preserve custom vary header and append RSC headers in app route handlers', async () => {
    const res = await next.fetch('/normal')
    const varyHeader = res.headers.get('vary')

    // Custom header is preserved
    expect(varyHeader).toContain('User-Agent')
    expect(res.headers.get('cache-control')).toBe('s-maxage=3600')

    // Next.js internal headers are appended
    expect(varyHeader).toContain('rsc')
    expect(varyHeader).toContain('next-router-state-tree')
    expect(varyHeader).toContain('next-router-prefetch')
  })

  it('should preserve middleware vary header in combination with route handlers', async () => {
    const res = await next.fetch('/normal')
    const varyHeader = res.headers.get('vary')
    const customHeader = res.headers.get('my-custom-header')

    // Middleware header is set
    expect(customHeader).toBe('test')

    // Both middleware and route handler vary headers are preserved
    expect(varyHeader).toContain('my-custom-header')
    expect(varyHeader).toContain('User-Agent')

    // Next.js internal headers are still present
    expect(varyHeader).toContain('rsc')
    expect(varyHeader).toContain('next-router-state-tree')
    expect(varyHeader).toContain('next-router-prefetch')
  })
})

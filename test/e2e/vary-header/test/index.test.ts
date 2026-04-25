import { nextTestSetup } from 'e2e-utils'
import { expectVaryHeaderToContain } from 'next-test-utils'
import path from 'path'

describe('Vary Header Tests', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, '../app'),
    skipDeployment: true,
  })

  it('should preserve custom vary header in API routes', async () => {
    const res = await next.fetch('/api/custom-vary')
    expectVaryHeaderToContain(res.headers.get('vary'), ['custom-header'])
  })

  it('should preserve custom vary header and append RSC headers in app route handlers', async () => {
    const res = await next.fetch('/normal')
    const varyHeader = res.headers.get('vary')

    // Custom header is preserved
    expectVaryHeaderToContain(varyHeader, ['user-agent'])
    expect(res.headers.get('cache-control')).toBe('s-maxage=3600')

    // Next.js internal headers are appended
    expectVaryHeaderToContain(varyHeader, [
      'rsc',
      'next-router-state-tree',
      'next-router-prefetch',
    ])
  })

  it('should preserve middleware vary header in combination with route handlers', async () => {
    const res = await next.fetch('/normal')
    const varyHeader = res.headers.get('vary')
    const customHeader = res.headers.get('my-custom-header')

    // Middleware header is set
    expect(customHeader).toBe('test')

    // Both middleware and route handler vary headers are preserved
    expectVaryHeaderToContain(varyHeader, ['my-custom-header', 'user-agent'])

    // Next.js internal headers are still present
    expectVaryHeaderToContain(varyHeader, [
      'rsc',
      'next-router-state-tree',
      'next-router-prefetch',
    ])
  })
})

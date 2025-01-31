import { createNext, FileRef } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Vary Header Tests', () => {
  let next

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/custom-vary.js': new FileRef(
          path.join(__dirname, '../pages/api/custom-vary.js')
        ),
        'app/normal/route.js': new FileRef(
          path.join(__dirname, '../app/normal/route.js')
        ),
        'middleware.js': new FileRef(path.join(__dirname, '../middleware.js')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should preserve custom vary header in API routes', async () => {
    const res = await fetchViaHTTP(next.url, '/api/custom-vary')
    expect(res.headers.get('vary')).toContain('Custom-Header')
  })

  it('should preserve custom vary header and append RSC headers in app route handlers', async () => {
    const res = await fetchViaHTTP(next.url, '/normal')
    const varyHeader = res.headers.get('vary')

    // Custom header is preserved
    expect(varyHeader).toContain('User-Agent')
    expect(res.headers.get('cache-control')).toBe('s-maxage=3600')

    // Next.js internal headers are appended
    expect(varyHeader).toContain('RSC')
    expect(varyHeader).toContain('Next-Router-State-Tree')
    expect(varyHeader).toContain('Next-Router-Prefetch')
  })

  it('should preserve middleware vary header in combination with route handlers', async () => {
    const res = await fetchViaHTTP(next.url, '/normal')
    const varyHeader = res.headers.get('vary')
    const customHeader = res.headers.get('my-custom-header')

    // Middleware header is set
    expect(customHeader).toBe('test')

    // Both middleware and route handler vary headers are preserved
    expect(varyHeader).toContain('my-custom-header')
    expect(varyHeader).toContain('User-Agent')

    // Next.js internal headers are still present
    expect(varyHeader).toContain('RSC')
    expect(varyHeader).toContain('Next-Router-State-Tree')
    expect(varyHeader).toContain('Next-Router-Prefetch')
  })
})

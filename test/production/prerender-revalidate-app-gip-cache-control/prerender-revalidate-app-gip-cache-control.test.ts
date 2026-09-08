import { nextTestSetup } from 'e2e-utils'

describe('prerender-revalidate-app-gip-cache-control', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not let a Cache-Control header set in _app getInitialProps override the ISR Cache-Control header on a fallback: blocking first request', async () => {
    const res = await next.fetch('/first-request-slug')
    const cacheControl = res.headers.get('Cache-Control')
    expect(cacheControl).toMatch(/^s-maxage=10(,|$)/)
    expect(cacheControl).not.toContain('no-store')
  })

  it('should still apply a Cache-Control header set in _app getInitialProps for a non-SSG page', async () => {
    const res = await next.fetch('/ssr')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

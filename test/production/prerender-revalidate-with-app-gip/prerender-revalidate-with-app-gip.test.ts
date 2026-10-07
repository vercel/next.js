import { nextTestSetup } from 'e2e-utils'

describe('ISG with GIP in _app should not override cache-control', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use ISG cache-control instead of _app header', async () => {
    const res = await next.fetch('/isg')
    const cacheControl = res.headers.get('Cache-Control')

    // The ISG page has revalidate: 10, so the cache-control should reflect
    // the ISG revalidation period, NOT the "public, max-age=3600" set by _app
    expect(cacheControl).not.toContain('max-age=3600')
    expect(cacheControl).toContain('s-maxage=10')
  })
})

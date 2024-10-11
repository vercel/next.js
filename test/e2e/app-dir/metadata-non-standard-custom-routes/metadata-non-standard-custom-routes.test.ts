import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-non-standard-custom-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with custom sitemap route', async () => {
    const res = await next.fetch('/sitemap')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml')
    expect(await res.text()).toMatchInlineSnapshot(``)
  })
})

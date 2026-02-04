import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-non-standard-custom-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with custom sitemap route', async () => {
    const res = await next.fetch('/sitemap')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml')
    expect(await res.text()).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
            <loc>https://example.com</loc>
            <lastmod>2021-01-01</lastmod>
            <changefreq>weekly</changefreq>
            <priority>0.5</priority>
            </url>
            </urlset>"
    `)
  })
})

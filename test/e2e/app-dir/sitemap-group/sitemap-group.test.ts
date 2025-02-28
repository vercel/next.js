import { nextTestSetup } from 'e2e-utils'

describe('sitemap-group', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not add suffix to sitemap under group routes', async () => {
    const res = await next.fetch('/foo/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml')
    const text = await res.text()
    expect(text).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
      <loc>https://www.vercel.com</loc>
      <lastmod>2024-12-05T23:45:13.405Z</lastmod>
      <changefreq>monthly</changefreq>
      </url>
      </urlset>
      "
    `)
  })
})

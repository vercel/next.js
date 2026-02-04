import { nextTestSetup } from 'e2e-utils'

describe('middleware-sitemap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not be affected by middleware if sitemap.xml is excluded from the matcher', async () => {
    const html = await next.render('/')
    expect(html).toContain('redirected')

    const xml = await next.render('/sitemap.xml')
    expect(xml).toMatchInlineSnapshot(`
     "<?xml version="1.0" encoding="UTF-8"?>
     <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url>
     <loc>https://vercel.com</loc>
     <lastmod>2023-10-01</lastmod>
     <changefreq>yearly</changefreq>
     <priority>1</priority>
     </url>
     </urlset>
     "
    `)
  })
})

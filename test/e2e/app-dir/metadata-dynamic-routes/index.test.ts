import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - metadata dynamic routes',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    describe('dynamic routes', () => {
      it('should handle robots.[ext] dynamic routes', async () => {
        const res = await next.fetch('/robots.txt')
        const text = await res.text()

        expect(res.headers.get('content-type')).toBe('text/plain')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )

        expect(text).toMatchInlineSnapshot(`
          "User-Agent: Googlebot
          Allow: /

          User-Agent: Applebot
          User-Agent: Bingbot
          Disallow: /
          Crawl-delay: 2

          Host: https://example.com
          Sitemap: https://example.com/sitemap.xml
          "
        `)
      })

      it('should handle sitemap.[ext] dynamic routes', async () => {
        const res = await next.fetch('/sitemap.xml')
        const text = await res.text()

        expect(res.headers.get('content-type')).toBe('application/xml')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )

        expect(text).toMatchInlineSnapshot(`
          "<?xml version=\\"1.0\\" encoding=\\"UTF-8\\"?>
          <urlset xmlns=\\"http://www.sitemaps.org/schemas/sitemap/0.9\\">
          <url>
          <loc>https://example.com</loc>
          <lastmod>2021-01-01</lastmod>
          </url>
          <url>
          <loc>https://example.com/about</loc>
          <lastmod>2021-01-01</lastmod>
          </url>
          </urlset>
          "
        `)
      })

      it('should handle manifest.[ext] dynamic routes', async () => {
        const res = await next.fetch('/manifest.json')
        const json = await res.json()

        expect(res.headers.get('content-type')).toBe(
          'application/manifest+json'
        )
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )

        expect(json).toMatchObject({
          name: 'Next.js App',
          short_name: 'Next.js App',
          description: 'Next.js App',
          start_url: '/',
          display: 'standalone',
          background_color: '#fff',
          theme_color: '#fff',
          icons: [
            {
              src: '/favicon.ico',
              sizes: 'any',
              type: 'image/x-icon',
            },
          ],
        })
      })
    })
  }
)

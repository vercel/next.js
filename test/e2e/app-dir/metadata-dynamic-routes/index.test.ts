import { createNextDescribe } from 'e2e-utils'
import imageSize from 'image-size'

createNextDescribe(
  'app dir - metadata dynamic routes',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      '@vercel/og': '0.4.0',
    },
  },
  ({ next }) => {
    describe('text routes', () => {
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
    })

    describe('social image routes', () => {
      it('should handle manifest.[ext] dynamic routes', async () => {
        const res = await next.fetch('/manifest.webmanifest')
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

      it('should render og image with opengraph-image dynamic routes', async () => {
        const res = await next.fetch('/opengraph-image')

        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )
      })

      it('should render og image with twitter-image dynamic routes', async () => {
        const res = await next.fetch('/twitter-image')

        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )
      })

      it('should support params as argument in dynamic routes', async () => {
        const bufferBig = await (
          await next.fetch('/dynamic/big/opengraph-image')
        ).buffer()
        const bufferSmall = await (
          await next.fetch('/dynamic/small/opengraph-image')
        ).buffer()

        const sizeBig = imageSize(bufferBig)
        const sizeSmall = imageSize(bufferSmall)
        expect([sizeBig.width, sizeBig.height]).toEqual([1200, 630])
        expect([sizeSmall.width, sizeSmall.height]).toEqual([600, 315])
      })
    })

    describe('icon image routes', () => {
      it('should render icon with dynamic routes', async () => {
        const res = await next.fetch('/icon')

        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )
      })

      it('should render apple icon with dynamic routes', async () => {
        const res = await next.fetch('/apple-icon')

        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe(
          'public, max-age=0, must-revalidate'
        )
      })
    })

    it('should inject dynamic metadata properly to head', async () => {
      const $ = await next.render$('/')
      const $icon = $('link[rel="icon"]')
      const $appleIcon = $('link[rel="apple-touch-icon"]')
      const ogImageUrl = $('meta[property="og:image"]').attr('content')
      const twitterImageUrl = $('meta[name="twitter:image"]').attr('content')

      // non absolute urls
      expect($icon.attr('href')).toBe('/icon')
      expect($icon.attr('sizes')).toBe('512x512')
      expect($icon.attr('type')).toBe('image/png')
      expect($appleIcon.attr('href')).toBe('/apple-icon')
      expect($appleIcon.attr('sizes')).toBe(undefined)
      expect($appleIcon.attr('type')).toBe('image/png')

      // absolute urls
      expect(ogImageUrl).toBe(
        'https://deploy-preview-abc.vercel.app/opengraph-image'
      )
      expect(twitterImageUrl).toBe(
        'https://deploy-preview-abc.vercel.app/twitter-image'
      )

      // alt text
      expect($('meta[property="og:image:alt"]').attr('content')).toBe(
        'Open Graph'
      )
      expect($('meta[name="twitter:image:alt"]').attr('content')).toBe(
        'Twitter'
      )
    })
  }
)

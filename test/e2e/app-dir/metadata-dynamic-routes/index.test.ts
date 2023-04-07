import { createNextDescribe } from 'e2e-utils'
import imageSize from 'image-size'

const CACHE_HEADERS = {
  NONE: 'no-cache, no-store',
  LONG: 'public, immutable, no-transform, max-age=31536000',
  REVALIDATE: 'public, max-age=0, must-revalidate',
}

const hashRegex = /\?\w+$/

createNextDescribe(
  'app dir - metadata dynamic routes',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev, isNextDeploy }) => {
    describe('text routes', () => {
      it('should handle robots.[ext] dynamic routes', async () => {
        const res = await next.fetch('/robots.txt')
        const text = await res.text()

        expect(res.headers.get('content-type')).toBe('text/plain')
        expect(res.headers.get('cache-control')).toBe(CACHE_HEADERS.REVALIDATE)

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
        expect(res.headers.get('cache-control')).toBe(CACHE_HEADERS.REVALIDATE)

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
        expect(res.headers.get('cache-control')).toBe(CACHE_HEADERS.REVALIDATE)

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
          isNextDev ? CACHE_HEADERS.NONE : CACHE_HEADERS.LONG
        )
      })

      it('should render og image with twitter-image dynamic routes', async () => {
        const res = await next.fetch('/twitter-image')

        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe(
          isNextDev ? CACHE_HEADERS.NONE : CACHE_HEADERS.LONG
        )
      })

      it('should fill params into dynamic routes url of metadata images', async () => {
        const $ = await next.render$('/dynamic/big')
        const ogImageUrl = $('meta[property="og:image"]').attr('content')
        expect(ogImageUrl).toMatch(hashRegex)
        expect(ogImageUrl).toMatch('/dynamic/big/opengraph-image')
        // should already normalize the parallel routes segment to url
        expect(ogImageUrl).not.toContain('(group)')
      })

      it('should support params as argument in dynamic routes', async () => {
        const big$ = await next.render$('/dynamic/big')
        const small$ = await next.render$('/dynamic/small')
        const bigOgUrl = new URL(
          big$('meta[property="og:image"]').attr('content')
        )
        const smallOgUrl = new URL(
          small$('meta[property="og:image"]').attr('content')
        )
        const bufferBig = await (await next.fetch(bigOgUrl.pathname)).buffer()
        const bufferSmall = await (
          await next.fetch(smallOgUrl.pathname)
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
          isNextDev ? CACHE_HEADERS.NONE : CACHE_HEADERS.LONG
        )
      })

      it('should render apple icon with dynamic routes', async () => {
        const res = await next.fetch('/apple-icon')

        expect(res.headers.get('content-type')).toBe('image/png')
        expect(res.headers.get('cache-control')).toBe(
          isNextDev ? CACHE_HEADERS.NONE : CACHE_HEADERS.LONG
        )
      })
    })

    it('should generate unique path for image routes under group routes', async () => {
      const $ = await next.render$('/blog')
      const ogImageUrl = $('meta[property="og:image"]').attr('content')
      const ogImageUrlInstance = new URL(ogImageUrl)
      const res = await next.fetch(ogImageUrlInstance.pathname)

      // generate unique path with suffix for image routes under group routes
      expect(ogImageUrl).toMatch(/opengraph-image-\w{6}\?/)
      expect(ogImageUrl).toMatch(hashRegex)
      expect(res.status).toBe(200)
    })

    it('should inject dynamic metadata properly to head', async () => {
      const $ = await next.render$('/')
      const $icon = $('link[rel="icon"]')
      const $appleIcon = $('link[rel="apple-touch-icon"]')
      const ogImageUrl = $('meta[property="og:image"]').attr('content')
      const twitterImageUrl = $('meta[name="twitter:image"]').attr('content')
      const twitterTitle = $('meta[name="twitter:title"]').attr('content')
      const twitterDescription = $('meta[name="twitter:description"]').attr(
        'content'
      )

      expect($('link[rel="favicon"]')).toHaveLength(0)

      // non absolute urls
      expect($icon.attr('href')).toContain('/icon')
      expect($icon.attr('href')).toMatch(hashRegex)
      expect($icon.attr('sizes')).toBe('512x512')
      expect($icon.attr('type')).toBe('image/png')
      expect($appleIcon.attr('href')).toContain('/apple-icon')
      expect($appleIcon.attr('href')).toMatch(hashRegex)
      expect($appleIcon.attr('sizes')).toBe(undefined)
      expect($appleIcon.attr('type')).toBe('image/png')

      // Twitter
      expect(twitterTitle).toBe('Twitter - Next.js App')
      expect(twitterDescription).toBe('Twitter - This is a Next.js App')

      if (isNextDeploy) {
        // absolute urls
        expect(ogImageUrl).toMatch(
          /https:\/\/\w+.vercel.app\/opengraph-image\?/
        )
        expect(twitterImageUrl).toMatch(
          /https:\/\/\w+.vercel.app\/twitter-image\?/
        )
      } else {
        // absolute urls
        expect(ogImageUrl).toMatch(/http:\/\/localhost:\d+\/opengraph-image\?/)
        expect(twitterImageUrl).toMatch(
          /http:\/\/localhost:\d+\/twitter-image\?/
        )
      }
      expect(ogImageUrl).toMatch(hashRegex)
      expect(twitterImageUrl).toMatch(hashRegex)

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

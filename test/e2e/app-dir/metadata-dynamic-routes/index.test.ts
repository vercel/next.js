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
  },
  ({ next, isNextDev, isNextStart, isNextDeploy }) => {
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

      if (!isNextDeploy) {
        // TODO-APP: investigate the dynamic routes failing in deployment tests
        it('should support generate multi images with generateImageMetadata', async () => {
          const $ = await next.render$('/dynamic/big')
          const iconUrls = $('link[rel="icon"]')
            .toArray()
            .map((el) => {
              return {
                href: $(el).attr('href').split('?')[0],
                sizes: $(el).attr('sizes'),
                type: $(el).attr('type'),
              }
            })
          // slug is id param from generateImageMetadata
          expect(iconUrls).toMatchObject([
            {
              href: '/dynamic/big/icon-48jo90/small',
              sizes: '48x48',
              type: 'image/png',
            },
            {
              href: '/dynamic/big/icon-48jo90/medium',
              sizes: '72x72',
              type: 'image/png',
            },
          ])

          const appleTouchIconUrls = $('link[rel="apple-touch-icon"]')
            .toArray()
            .map((el) => {
              return {
                href: $(el).attr('href').split('?')[0],
                sizes: $(el).attr('sizes'),
                type: $(el).attr('type'),
              }
            })
          // slug is index by default
          expect(appleTouchIconUrls).toEqual([
            {
              href: '/dynamic/big/apple-icon-48jo90/0',
              sizes: '48x48',
              type: 'image/png',
            },
            {
              href: '/dynamic/big/apple-icon-48jo90/1',
              sizes: '64x64',
              type: 'image/png',
            },
          ])
        })

        it('should support generate multi sitemaps with generateSitemaps', async () => {
          const ids = [0, 1, 2, 3]
          function fetchSitemap(id) {
            return next
              .fetch(`/dynamic/small/sitemap.xml/${id}`)
              .then((res) => res.text())
          }

          for (const id of ids) {
            const text = await fetchSitemap(id)
            expect(text).toContain(
              `<loc>https://example.com/dynamic/${id}</loc>`
            )
          }
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
      }

      it('should fill params into routes groups url of static images', async () => {
        const $ = await next.render$('/static')
        const ogImageUrl = $('meta[property="og:image"]').attr('content')
        expect(ogImageUrl).toMatch(hashRegex)
        expect(ogImageUrl).toMatch('/static/opengraph-image')
        // should already normalize the parallel routes segment to url
        expect(ogImageUrl).not.toContain('(group)')
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
      const twitterImageUrl = $('meta[name="twitter:image"]').attr('content')
      const ogImageUrlInstance = new URL(ogImageUrl)
      const twitterImageUrlInstance = new URL(twitterImageUrl)

      const resOg = await next.fetch(ogImageUrlInstance.pathname)
      const resTwitter = await next.fetch(twitterImageUrlInstance.pathname)

      // generate unique path with suffix for image routes under group routes
      expect(ogImageUrl).toMatch(/opengraph-image-\w{6}\?/)
      expect(ogImageUrl).toMatch(hashRegex)
      expect(twitterImageUrl).toMatch(/twitter-image-\w{6}\?/)
      expect(twitterImageUrl).toMatch(hashRegex)

      expect(resOg.status).toBe(200)
      expect(resTwitter.status).toBe(200)
    })

    it('should pick configured metadataBase instead of deployment url for canonical url', async () => {
      const $ = await next.render$('/')
      const canonicalUrl = $('link[rel="canonical"]').attr('href')
      expect(canonicalUrl).toBe('https://mydomain.com/')
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

      // manifest
      expect($('link[rel="manifest"]').attr('href')).toBe(
        '/manifest.webmanifest'
      )

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

      // Should prefer to pick up deployment url for metadata routes
      let ogImageUrlPattern
      let twitterImageUrlPattern
      if (isNextDeploy) {
        // absolute urls
        ogImageUrlPattern = /https:\/\/[\w-]+.vercel.app\/opengraph-image\?/
        twitterImageUrlPattern = /https:\/\/[\w-]+.vercel.app\/twitter-image\?/
      } else if (isNextStart) {
        // configured metadataBase for next start
        ogImageUrlPattern = /https:\/\/mydomain.com\/opengraph-image\?/
        twitterImageUrlPattern = /https:\/\/mydomain.com\/twitter-image\?/
      } else {
        // localhost for dev
        ogImageUrlPattern = /http:\/\/localhost:\d+\/opengraph-image\?/
        twitterImageUrlPattern = /http:\/\/localhost:\d+\/twitter-image\?/
      }
      expect(ogImageUrl).toMatch(ogImageUrlPattern)
      expect(twitterImageUrl).toMatch(twitterImageUrlPattern)
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

    it('should use localhost for local prod and fallback to deployment url when metadataBase is falsy', async () => {
      const $ = await next.render$('/metadata-base/unset')
      const twitterImage = $('meta[name="twitter:image"]').attr('content')
      const ogImages = $('meta[property="og:image"]')

      ogImages.each((_, ogImage) => {
        const ogImageUrl = $(ogImage).attr('content')
        expect(ogImageUrl).toMatch(
          isNextDeploy
            ? /https:\/\/[\w-]+.vercel.app/
            : /http:\/\/localhost:\d+/
        )
        expect(ogImageUrl).toMatch(
          /\/metadata-base\/unset\/opengraph-image\/10\d/
        )
      })

      expect(twitterImage).toMatch(
        isNextDeploy ? /https:\/\/[\w-]+.vercel.app/ : /http:\/\/localhost:\d+/
      )
      expect(twitterImage).toMatch(/\/metadata-base\/unset\/twitter-image\.png/)
    })

    if (isNextStart) {
      it('should support edge runtime of image routes', async () => {
        const middlewareManifest = JSON.parse(
          await next.readFile('.next/server/middleware-manifest.json')
        )
        const functionRoutes = Object.keys(middlewareManifest.functions)
        const edgeRoute = functionRoutes.find((route) =>
          route.startsWith('/(group)/twitter-image-')
        )
        expect(edgeRoute).toMatch(
          /\/\(group\)\/twitter-image-\w{6}\/\[\[\.\.\.__metadata_id__\]\]\/route/
        )
      })

      it('should include default og font files in file trace', async () => {
        const fileTrace = JSON.parse(
          await next.readFile(
            '.next/server/app/opengraph-image/[[...__metadata_id__]]/route.js.nft.json'
          )
        )

        // @vercel/og default font should be traced
        const isTraced = fileTrace.files.some((filePath) =>
          filePath.includes('/noto-sans-v27-latin-regular.ttf')
        )
        expect(isTraced).toBe(true)
      })
    }
  }
)

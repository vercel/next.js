import { nextTestSetup } from 'e2e-utils'
import imageSize from 'image-size'
import { check } from 'next-test-utils'

const CACHE_HEADERS = {
  NONE: 'no-cache, no-store',
  LONG: 'public, immutable, no-transform, max-age=31536000',
  REVALIDATE: 'public, max-age=0, must-revalidate',
}

const hashRegex = /\?\w+/

describe('app dir - metadata dynamic routes', () => {
  const { next, isNextDev, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@vercel/og': 'latest',
    },
  })

  describe('robots.txt', () => {
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
  })

  describe('sitemap', () => {
    it('should handle sitemap.[ext] dynamic routes', async () => {
      const res = await next.fetch('/sitemap.xml')
      const text = await res.text()

      expect(res.headers.get('content-type')).toBe('application/xml')
      expect(res.headers.get('cache-control')).toBe(CACHE_HEADERS.REVALIDATE)

      expect(text).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
      <loc>https://example.com</loc>
      <lastmod>2021-01-01</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.5</priority>
      </url>
      <url>
      <loc>https://example.com/about</loc>
      <lastmod>2021-01-01</lastmod>
      </url>
      </urlset>
      "
    `)
    })

    it('should support generate multi sitemaps with generateSitemaps', async () => {
      const ids = ['child0', 'child1', 'child2', 'child3']
      function fetchSitemap(id, withExtension) {
        return next.fetch(`/gsp/sitemap/${id}${withExtension ? `.xml` : ''}`)
      }

      // Required to have .xml extension for dynamic sitemap
      for (const id of ids) {
        const text = await fetchSitemap(id, true).then((res) => res.text())
        expect(text).toContain(`<loc>https://example.com/dynamic/${id}</loc>`)
      }

      // Should 404 when missing .xml extension
      for (const id of ids) {
        const { status } = await fetchSitemap(id, false)
        expect(status).toBe(404)
      }
    })

    it('should not throw if client components are imported but not used in sitemap', async () => {
      const { status } = await next.fetch('/client-ref-dependency/sitemap.xml')
      expect(status).toBe(200)
    })

    it('should support alternate.languages in sitemap', async () => {
      const xml = await (await next.fetch('/lang/sitemap.xml')).text()

      expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml')
      expect(xml).toContain(
        `<xhtml:link rel="alternate" hreflang="es" href="https://example.com/es/about" />`
      )
      expect(xml).toContain(
        `<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about" />`
      )
    })

    it('should support images in sitemap', async () => {
      const xml = await (await next.fetch('/sitemap-image/sitemap.xml')).text()

      expect(xml).toContain(
        `<image:image>\n<image:loc>https://example.com/image1.jpg</image:loc>\n</image:image>`
      )
      expect(xml).toContain(
        `<image:image>\n<image:loc>https://example.com/image2.jpg</image:loc>\n</image:image>`
      )
    })

    it('should support videos in sitemap', async () => {
      const xml = await (await next.fetch('/sitemap-video/sitemap.xml')).text()
      expect(xml).toMatchInlineSnapshot(`
        "<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
        <url>
        <loc>https://example.com/about</loc>
        <video:video>
        <video:title>example</video:title>
        <video:thumbnail_loc>https://example.com/image.jpg</video:thumbnail_loc>
        <video:description>this is the description</video:description>
        <video:content_loc>http://streamserver.example.com/video123.mp4</video:content_loc>
        <video:player_loc>https://www.example.com/videoplayer.php?video=123</video:player_loc>
        <video:duration>2</video:duration>
        <video:view_count>50</video:view_count>
        <video:tag>summer</video:tag>
        <video:rating>4</video:rating>
        <video:expiration_date>2025-09-16</video:expiration_date>
        <video:publication_date>2024-09-16</video:publication_date>
        <video:family_friendly>yes</video:family_friendly>
        <video:requires_subscription>no</video:requires_subscription>
        <video:live>no</video:live>
        <video:restriction relationship="allow">IE GB US CA</video:restriction>
        <video:platform relationship="allow">web</video:platform>
        <video:uploader info="https://www.example.com/users/grillymcgrillerson">GrillyMcGrillerson</video:uploader>
        </video:video>
        </url>
        </urlset>
        "
      `)
    })

    if (isNextStart) {
      it('should optimize routes without multiple generation API as static routes', async () => {
        const appPathsManifest = JSON.parse(
          await next.readFile('.next/server/app-paths-manifest.json')
        )

        expect(appPathsManifest).toMatchObject({
          // static routes
          '/twitter-image/route': 'app/twitter-image/route.js',
          '/sitemap.xml/route': 'app/sitemap.xml/route.js',

          // dynamic
          '/gsp/sitemap/[__metadata_id__]/route':
            'app/gsp/sitemap/[__metadata_id__]/route.js',
          '/(group)/dynamic/[size]/apple-icon-ahg52g/[__metadata_id__]/route':
            'app/(group)/dynamic/[size]/apple-icon-ahg52g/[__metadata_id__]/route.js',
        })
      })

      it('should generate static paths of dynamic sitemap in production', async () => {
        const sitemapPaths = ['child0', 'child1', 'child2', 'child3'].map(
          (id) => `.next/server/app/gsp/sitemap/${id}.xml.meta`
        )
        const promises = sitemapPaths.map(async (filePath) => {
          expect(await next.hasFile(filePath)).toBe(true)
        })
        await Promise.all(promises)
      })
    }
  })

  describe('social image routes', () => {
    it('should handle manifest.[ext] dynamic routes', async () => {
      const res = await next.fetch('/manifest.webmanifest')
      const json = await res.json()

      expect(res.headers.get('content-type')).toBe('application/manifest+json')
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
      // nodejs runtime
      let res = await next.fetch('/twitter-image')

      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('cache-control')).toBe(
        isNextDev ? CACHE_HEADERS.NONE : CACHE_HEADERS.LONG
      )

      if (isNextDev) {
        await check(async () => {
          next.hasFile('.next/server/app-paths-manifest.json')
          return 'success'
        }, /success/)

        const appPathsManifest = JSON.parse(
          await next.readFile('.next/server/app-paths-manifest.json')
        )
        const entryKeys = Object.keys(appPathsManifest)
        // Only has one route for twitter-image with catch-all routes in dev
        expect(entryKeys).not.toContain('/twitter-image')
        expect(entryKeys).toContain('/twitter-image/route')
      }

      // edge runtime
      res = await next.fetch('/twitter-image2')
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('cache-control')).toBe(
        isNextDev ? CACHE_HEADERS.NONE : CACHE_HEADERS.LONG
      )
    })

    it('should support generate multi images with generateImageMetadata', async () => {
      const $ = await next.render$('/dynamic/big')
      const iconUrls = $('link[rel="icon"]')
        .toArray()
        .map((el) => {
          return {
            href: $(el).attr('href').split('?', 1)[0],
            sizes: $(el).attr('sizes'),
            type: $(el).attr('type'),
          }
        })

      // slug is id param from generateImageMetadata
      expect(iconUrls).toMatchObject([
        {
          href: '/dynamic/big/icon-ahg52g/small',
          sizes: '48x48',
          type: 'image/png',
        },
        {
          href: '/dynamic/big/icon-ahg52g/medium',
          sizes: '72x72',
          type: 'image/png',
        },
      ])

      const appleTouchIconUrls = $('link[rel="apple-touch-icon"]')
        .toArray()
        .map((el) => {
          return {
            href: $(el).attr('href').split('?', 1)[0],
            sizes: $(el).attr('sizes'),
            type: $(el).attr('type'),
          }
        })
      // slug is index by default
      expect(appleTouchIconUrls).toEqual([
        {
          href: '/dynamic/big/apple-icon-ahg52g/0',
          sizes: '48x48',
          type: 'image/png',
        },
        {
          href: '/dynamic/big/apple-icon-ahg52g/1',
          sizes: '64x64',
          type: 'image/png',
        },
      ])
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
      const bufferSmall = await (await next.fetch(smallOgUrl.pathname)).buffer()

      const sizeBig = imageSize(bufferBig)
      const sizeSmall = imageSize(bufferSmall)
      expect([sizeBig.width, sizeBig.height]).toEqual([1200, 630])
      expect([sizeSmall.width, sizeSmall.height]).toEqual([600, 315])
    })

    it('should fill params into routes groups url of static images', async () => {
      const $ = await next.render$('/static')
      const ogImageUrl = $('meta[property="og:image"]').attr('content')
      expect(ogImageUrl).toMatch(hashRegex)
      expect(ogImageUrl).toMatch('/static/opengraph-image')
      // should already normalize the parallel routes segment to url
      expect(ogImageUrl).not.toContain('(group)')
    })

    it('should handle custom fonts in both edge and nodejs runtime', async () => {
      const resOgEdge = await next.fetch('/font/opengraph-image')
      const resOgNodejs = await next.fetch('/font/opengraph-image2')

      expect(resOgEdge.status).toBe(200)
      expect(resOgEdge.headers.get('content-type')).toBe('image/png')
      expect(resOgNodejs.status).toBe(200)
      expect(resOgNodejs.headers.get('content-type')).toBe('image/png')
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

  if (isNextStart) {
    describe('route segment config', () => {
      it('should generate dynamic route if dynamic config is force-dynamic', async () => {
        const dynamicRoute = '/route-config/sitemap.xml'

        expect(
          await next.hasFile(`.next/server/app${dynamicRoute}/route.js`)
        ).toBe(true)
        // dynamic routes should not have body and meta files
        expect(await next.hasFile(`.next/server/app${dynamicRoute}.body`)).toBe(
          false
        )
        expect(await next.hasFile(`.next/server/app${dynamicRoute}.meta`)).toBe(
          false
        )
      })
    })
  }

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
    expect(canonicalUrl).toBe('https://mydomain.com')
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
    expect($('link[rel="manifest"]').attr('href')).toBe('/manifest.webmanifest')

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
    expect($('meta[name="twitter:image:alt"]').attr('content')).toBe('Twitter')
  })

  it('should use localhost for local prod and fallback to deployment url when metadataBase is falsy', async () => {
    const $ = await next.render$('/metadata-base/unset')
    const twitterImage = $('meta[name="twitter:image"]').attr('content')
    const ogImages = $('meta[property="og:image"]')

    expect(ogImages.length).toBe(2)
    ogImages.each((_, ogImage) => {
      const ogImageUrl = $(ogImage).attr('content')
      expect(ogImageUrl).toMatch(
        isNextDeploy ? /https:\/\/[\w-]+.vercel.app/ : /http:\/\/localhost:\d+/
      )
      expect(ogImageUrl).toMatch(
        /\/metadata-base\/unset\/opengraph-image2\/10\d/
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
      expect(edgeRoute).toMatch(/\/\(group\)\/twitter-image-\w{6}\/route/)
    })

    it('should include default og font files in file trace', async () => {
      const fileTrace = JSON.parse(
        await next.readFile(
          '.next/server/app/metadata-base/unset/opengraph-image2/[__metadata_id__]/route.js.nft.json'
        )
      )

      // @vercel/og default font should be traced
      const isTraced = fileTrace.files.some((filePath) =>
        filePath.includes('/noto-sans-v27-latin-regular.ttf')
      )
      expect(isTraced).toBe(true)
    })

    it('should statically optimized single image route', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      const dynamicRoutes = Object.keys(prerenderManifest.routes)
      expect(dynamicRoutes).toContain('/opengraph-image')
      expect(dynamicRoutes).toContain('/opengraph-image-1ow20b')
      expect(dynamicRoutes).toContain('/apple-icon')
    })
  }
})

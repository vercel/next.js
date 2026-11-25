import { isNextStart, nextTestSetup } from 'e2e-utils'
import imageSize from 'image-size'

const buildModes = isNextStart ? ['default', 'debug-prerender'] : ['default']

describe.each(buildModes)('metadata route handlers (%s)', (mode) => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    buildArgs: mode === 'debug-prerender' ? ['--debug-prerender'] : [],
  })

  it('should generate an opengraph image with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/opengraph-image')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    if (isNextStart) {
      const [buildStatus] = next.cliOutput.match(/. \/opengraph-image/)

      expect(buildStatus).toBe('○ /opengraph-image')
    }
  })

  it('should generate an opengraph image with a custom (local) font', async () => {
    const res = await next.fetch('/custom-font/opengraph-image')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    if (isNextStart) {
      const [buildStatus] = next.cliOutput.match(
        /. \/custom-font\/opengraph-image/
      )

      expect(buildStatus).toBe('○ /custom-font/opengraph-image')
    }
  })

  it('should prerender a page that shares a segment with an opengraph image that uses a custom font', async () => {
    const res = await next.fetch('/first-post')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('First Post')

    const imageRes = await next.fetch('/first-post/opengraph-image')
    expect(imageRes.status).toBe(200)
    expect(imageRes.headers.get('content-type')).toBe('image/png')

    expect(next.cliOutput).not.toContain(
      'Unexpected cache miss after cache warming phase'
    )

    if (isNextStart) {
      // The image route uses generateStaticParams, so the build is expected
      // to prerender it for each param.
      expect(next.cliOutput).toMatch(/● \/first-post\/opengraph-image/)
      expect(next.cliOutput).toMatch(/● \/second-post\/opengraph-image/)
    }
  })

  it('should generate an icon image with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/icon')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    if (isNextStart) {
      const [buildStatus] = next.cliOutput.match(/. \/icon/)

      expect(buildStatus).toBe('○ /icon')
    }
  })

  it('should statically prerender an image whose component uses "use cache" directly', async () => {
    const res = await next.fetch('/apple-icon')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    if (isNextStart) {
      const [buildStatus] = next.cliOutput.match(/. \/apple-icon/)

      expect(buildStatus).toBe('○ /apple-icon')
    }
  })

  it('should treat a twitter image that reads request data as dynamic', async () => {
    const res = await next.fetch('/twitter-image')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    if (isNextStart) {
      const [buildStatus] = next.cliOutput.match(/. \/twitter-image/)

      expect(buildStatus).toBe('ƒ /twitter-image')
    }
  })

  it('should prerender an image tree with deferred Flight work', async () => {
    const response = await next.fetch('/deferred/icon')
    const image = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(imageSize(image)).toMatchObject({ width: 320, height: 320 })

    if (isNextStart) {
      const manifest = await next.readJSON('.next/prerender-manifest.json')
      expect(manifest.routes).toHaveProperty('/deferred/icon')
    }
  })

  it('should distinguish image contents and options within one route', async () => {
    const response = await next.fetch('/variants')
    const images: string[] = await response.json()

    expect(response.status).toBe(200)
    expect(images).toHaveLength(3)
    expect(images[0]).not.toBe(images[1])
    expect(imageSize(Buffer.from(images[0], 'base64'))).toMatchObject({
      width: 64,
      height: 64,
    })
    expect(imageSize(Buffer.from(images[2], 'base64'))).toMatchObject({
      width: 96,
      height: 48,
    })

    if (isNextStart) {
      const manifest = await next.readJSON('.next/prerender-manifest.json')
      expect(manifest.routes).toHaveProperty('/variants')
    }
  })

  it('should generate sitemaps with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml')

    const body = await res.text()

    if (isNextDev) {
      expect(body).toMatchInlineSnapshot(`
       "<?xml version="1.0" encoding="UTF-8"?>
       <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       <url>
       <loc>https://acme.com?sentinel=runtime</loc>
       </url>
       </urlset>
       "
      `)
    } else {
      expect(body).toMatchInlineSnapshot(`
       "<?xml version="1.0" encoding="UTF-8"?>
       <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       <url>
       <loc>https://acme.com?sentinel=buildtime</loc>
       </url>
       </urlset>
       "
      `)
    }
  })

  it('should generate multiple sitemaps with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/products/sitemap/1.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/xml')

    const body = await res.text()

    if (isNextDev) {
      expect(body).toMatchInlineSnapshot(`
       "<?xml version="1.0" encoding="UTF-8"?>
       <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       <url>
       <loc>https://acme.com/1?sentinel=runtime</loc>
       </url>
       </urlset>
       "
      `)
    } else {
      expect(body).toMatchInlineSnapshot(`
       "<?xml version="1.0" encoding="UTF-8"?>
       <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       <url>
       <loc>https://acme.com/1?sentinel=buildtime</loc>
       </url>
       </urlset>
       "
      `)
    }
  })

  it('should generate robots.txt with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/robots.txt')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')

    const body = await res.text()

    if (isNextDev) {
      expect(body).toMatchInlineSnapshot(`
        "User-Agent: *
        Allow: /runtime
        
        "
        `)
    } else {
      expect(body).toMatchInlineSnapshot(`
       "User-Agent: *
       Allow: /buildtime

       "
      `)
    }
  })

  it('should generate manifest.json with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/manifest.webmanifest')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain(
      'application/manifest+json'
    )

    const body = await res.json()

    if (isNextDev) {
      expect(body).toEqual({ name: 'runtime' })
    } else {
      expect(body).toEqual({ name: 'buildtime' })
    }
  })

  if (isNextStart) {
    it('should include static image handlers in the prerender manifest', async () => {
      const manifest = await next.readJSON('.next/prerender-manifest.json')

      for (const route of [
        '/opengraph-image',
        '/icon',
        '/apple-icon',
        '/deferred/icon',
        '/custom-font/opengraph-image',
        '/first-post/opengraph-image',
        '/second-post/opengraph-image',
        '/variants',
      ]) {
        expect(manifest.routes).toHaveProperty(route)
      }

      expect(manifest.routes).not.toHaveProperty('/twitter-image')
    })

    it('should include the client reference manifest in the route.js.nft.json files of dynamic metadata routes', async () => {
      for (const filename of [
        'icon',
        'manifest.webmanifest',
        'opengraph-image',
        'products/sitemap/[__metadata_id__]',
        'robots.txt',
        'sitemap.xml',
      ]) {
        const { files } = await next.readJSON(
          `/.next/server/app/${filename}/route.js.nft.json`
        )

        expect(
          files.find((e) => e.endsWith('route_client-reference-manifest.js'))
        ).toBeString()
      }
    })

    it('should not include the client reference manifest in the route.js.nft.json files of static metadata routes', async () => {
      const { files } = await next.readJSON(
        '/.next/server/app/favicon.ico/route.js.nft.json'
      )

      expect(
        files.find((e) => e.endsWith('route_client-reference-manifest.js'))
      ).toBeUndefined()
    })
  }
})

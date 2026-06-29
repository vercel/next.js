import { nextTestSetup } from 'e2e-utils'

describe('use-cache-metadata-route-handler', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
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

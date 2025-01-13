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

      // TODO: Should always be `○ /opengraph-image`.
      expect(buildStatus).toBeOneOf([
        '○ /opengraph-image',
        'ƒ /opengraph-image',
      ])
    }
  })

  it('should generate an icon image with a metadata route handler that uses "use cache"', async () => {
    const res = await next.fetch('/icon')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')

    if (isNextStart) {
      const [buildStatus] = next.cliOutput.match(/. \/icon/)

      // TODO: Should always be `○ /icon`.
      expect(buildStatus).toBeOneOf(['○ /icon', 'ƒ /icon'])
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
    expect(res.headers.get('content-type')).toBe('text/plain')

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
    expect(res.headers.get('content-type')).toBe('application/manifest+json')

    const body = await res.json()

    if (isNextDev) {
      expect(body).toEqual({ name: 'runtime' })
    } else {
      expect(body).toEqual({ name: 'buildtime' })
    }
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('metadata-reserved-app-route', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  const testCases = [
    { path: '/', name: 'root route' },
    { path: '/normal', name: 'normal route' },
    { path: '/sitemap', name: 'sitemap route' },
    { path: '/manifest', name: 'manifest route' },
    { path: '/robots', name: 'robots route' },
    { path: '/icon', name: 'icon route' },
    { path: '/opengraph-image', name: 'opengraph-image route' },
  ]

  testCases.forEach(({ path, name }) => {
    describe(`${name} tests`, () => {
      it(`should generate ${path} `, async () => {
        const res = await next.fetch(`${path}`)
        expect(res.status).toBe(200)
      })
    })
  })

  describe('use cache tests', () => {
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

    it('should generate multiple sitemaps with a metadata route handler that uses "use cache"', async () => {
      const res = await next.fetch('/sitemap/1.xml')
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
  })
})

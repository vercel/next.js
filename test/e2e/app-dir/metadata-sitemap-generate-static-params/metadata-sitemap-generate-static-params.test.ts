import { nextTestSetup } from 'e2e-utils'

describe('metadata-sitemap-generate-static-params', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should prerender sitemap.ts under a dynamic segment once per generated param', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      const routes = Object.keys(prerenderManifest.routes)

      expect(routes).toContain('/en/sitemap.xml')
      expect(routes).toContain('/zh/sitemap.xml')
      expect(routes).not.toContain('/-/sitemap.xml')

      // A colocated static metadata file has no `generateStaticParams`, so it
      // still prerenders once to the `-` placeholder pathname.
      expect(routes).toContain('/-/icon.png')
      expect(routes).not.toContain('/en/icon.png')
    })
  }

  it('should serve the sitemap for each generated param', async () => {
    for (const lang of ['en', 'zh']) {
      const res = await next.fetch(`/${lang}/sitemap.xml`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/xml')
      expect(await res.text()).toContain('<loc>https://example.com/</loc>')
    }
  })
})

import { nextTestSetup } from 'e2e-utils'

describe('sitemap-catchall-metadata-conflict', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve the HTML sitemap page at /sitemap via proxy rewrite', async () => {
    const res = await next.fetch('/sitemap')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('HTML sitemap')
    expect(html).toContain('region%3Ddefault%26locale%3Den')
  })

  it('should serve the metadata XML sitemap at /sitemap.xml', async () => {
    const res = await next.fetch('/sitemap.xml')
    expect(res.status).toBe(200)
    const xml = await res.text()
    expect(xml).toContain('urlset')
  })
})

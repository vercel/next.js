import { nextTestSetup } from 'e2e-utils'

describe('metadata-sitemap-route-conflict', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve the metadata sitemap', async () => {
    const res = await next.fetch('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<loc>https://vercel.com</loc>')
  })

  it('should render a page nested under the sitemap segment', async () => {
    const res = await next.fetch('/sitemap/foo')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('html sitemap: foo')
  })

  it('should render a page with multiple segments under the sitemap segment', async () => {
    const res = await next.fetch('/sitemap/foo/bar')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('html sitemap: foo/bar')
  })
})

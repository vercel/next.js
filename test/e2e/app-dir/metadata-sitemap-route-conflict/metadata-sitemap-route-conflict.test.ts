import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('metadata-sitemap-route-conflict', () => {
  const { next, isNextDev } = nextTestSetup({
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

  it('should serve a nested metadata sitemap', async () => {
    const res = await next.fetch('/nested/sitemap.xml')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<loc>https://nextjs.org</loc>')
  })

  if (isNextDev) {
    // Which routes a metadata file serves depends on its exports, not just its
    // filename, so adding `generateSitemaps` to an existing file has to be
    // picked up without a restart.
    it('should pick up generateSitemaps added to an existing sitemap file', async () => {
      await next.patchFile(
        'app/nested/sitemap.ts',
        (content) =>
          `export async function generateSitemaps() {\n  return [{ id: 0 }]\n}\n\n${content}`,
        async () => {
          await retry(async () => {
            const res = await next.fetch('/nested/sitemap/0.xml')
            expect(res.status).toBe(200)
            expect(await res.text()).toContain('<loc>https://nextjs.org</loc>')
          })
        }
      )

      // And removing it again restores the single route.
      await retry(async () => {
        const res = await next.fetch('/nested/sitemap.xml')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('<loc>https://nextjs.org</loc>')
      })
    })
  }
})

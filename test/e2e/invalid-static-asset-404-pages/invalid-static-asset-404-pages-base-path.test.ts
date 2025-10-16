import { nextTestSetup } from 'e2e-utils'

describe('invalid-static-asset-404-pages-base-path', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath: '/base',
    },
  })

  it('should return correct output with status 200 on valid asset path', async () => {
    const buildManifestPath = `/base/_next/static/${
      isNextDev ? 'development' : next.buildId
    }/_buildManifest.js`

    const res = await next.fetch(buildManifestPath)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('__BUILD_MANIFEST')
  })

  it('should return custom 404 page when fetching invalid non-asset path', async () => {
    const res = await next.fetch('/base/invalid-path')
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toContain('Custom Not Found')
  })

  it('should return 404 with plain text when fetching invalid asset path', async () => {
    const res = await next.fetch('/base/_next/static/invalid-path')
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toBe('Not Found')
  })
})

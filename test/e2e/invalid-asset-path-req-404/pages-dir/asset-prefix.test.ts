import { nextTestSetup } from 'e2e-utils'

const ASSET_PREFIX = '/_assets'

describe('pages-dir - invalid-asset-path-req-404 - asset-prefix', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      assetPrefix: ASSET_PREFIX,
    },
  })

  it('should return correct output with status 200 on valid asset path', async () => {
    const buildManifestPath = `${ASSET_PREFIX}/_next/static/${
      isNextDev ? 'development' : next.buildId
    }/_buildManifest.js`

    const res = await next.fetch(buildManifestPath)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('__BUILD_MANIFEST')
  })

  it('should return custom 404 page when fetching invalid non-asset path', async () => {
    const res = await next.fetch('/invalid-path')
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toContain('Custom Not Found')
  })

  it('should return 404 with plain text when fetching invalid asset path', async () => {
    const res = await next.fetch(
      `${ASSET_PREFIX}/_next/static/_invalid-asset-path`
    )
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toBe('Not Found')
  })
})

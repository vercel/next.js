import { nextTestSetup } from 'e2e-utils'

const BASE_PATH = '/_base'

describe('pages-dir - invalid-asset-path-req-404 - base-path', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath: BASE_PATH,
    },
  })

  it('should return correct output with status 200 on valid base path', async () => {
    const buildManifestPath = `${BASE_PATH}/_next/static/${
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

  it('should return 404 with plain text when fetching invalid base path', async () => {
    const res = await next.fetch(`${BASE_PATH}/_next/static/_invalid-base-path`)
    expect(res.status).toBe(404)
    const text = await res.text()
    expect(text).toBe('Not Found')
  })
})

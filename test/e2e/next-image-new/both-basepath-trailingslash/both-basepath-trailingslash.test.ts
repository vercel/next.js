import { nextTestSetup, isNextDev } from 'e2e-utils'
import { getDeploymentId } from 'next-test-utils'

describe('Image Component basePath + trailingSlash Tests', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    disableAutoSkewProtection: true,
    // Image URL assertions construct expected URLs via
    // `getDeploymentId(next.testDir, ...)`, which reads the local
    // `.next/required-server-files.json`. In deploy mode that file lives on
    // Vercel's infrastructure (not on disk locally), so the constructed
    // expected URL omits the `&dpl=...` query that Vercel injects at
    // runtime. The assertions are about local-build URL shape, not deploy
    // CDN URLs, so skip in deploy.
    skipDeployment: true,
  })
  if (skipped) return

  let dpl: string
  let assetDpl: string
  beforeAll(() => {
    dpl = getDeploymentId(next.testDir, isNextDev).getDeploymentIdQuery(true)
    assetDpl = getDeploymentId(next.testDir, isNextDev).getAssetQuery(true)
  })

  it('should correctly load image src from import', async () => {
    const browser = await next.browser('/prefix/')
    const img = await browser.elementById('import-img')
    const src = await img.getAttribute('src')
    expect(normalizeURL(src)).toBe(
      `/prefix/_next/image/?url=%2Fprefix%2F_next%2Fstatic%2Fmedia%2Ftest.HASH.jpg&w=828&q=75${assetDpl}`
    )
    const res = await next.fetch(src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('should correctly load image src from string', async () => {
    const browser = await next.browser('/prefix/')
    const img = await browser.elementById('string-img')
    const src = await img.getAttribute('src')
    expect(src).toBe(
      `/prefix/_next/image/?url=%2Fprefix%2Ftest.jpg&w=640&q=75${dpl}`
    )
    const res = await next.fetch(src)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })
})

function normalizeURL(text: string) {
  return text
    .replace(/test\.[0-9a-z_-]{4,}\.(png|jpe?g)/g, 'test.HASH.$1')
    .replace(/_next%2Fstatic%2Fimmutable%2F/g, '_next%2Fstatic%2F')
}

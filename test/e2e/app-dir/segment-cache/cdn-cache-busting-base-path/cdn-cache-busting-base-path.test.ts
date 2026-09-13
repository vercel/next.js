import { nextTestSetup } from 'e2e-utils'

describe('segment cache (CDN cache busting + basePath)', () => {
  const { next, isNextDev, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped || isNextDev || isNextDeploy) {
    test('should not run during dev or deploy test runs', () => {})
    return
  }

  it(
    'preserves basePath in the Location header when redirecting to the ' +
      'correct cache-busting search param',
    async () => {
      // Issue an RSC request without a `_rsc=` cache-busting search param.
      // The server should redirect with a 307 to the same URL with `_rsc=`
      // appended, and the Location header MUST include the configured
      // basePath so the browser stays inside the app.
      const res = await next.fetch('/docs/target-page', {
        redirect: 'manual',
        headers: {
          rsc: '1',
          'next-router-prefetch': '1',
          'next-router-segment-prefetch': '/_tree',
        },
      })
      expect(res.status).toBe(307)
      const location = res.headers.get('location')
      expect(location).not.toBeNull()
      expect(location).toMatch(/^\/docs\/target-page\?.*_rsc=/)
    }
  )
})

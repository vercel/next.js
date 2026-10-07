import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('config-redirect-next-data-middleware', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should still redirect a full navigation to a matching page', async () => {
    const res = await next.fetch('/foo/details', { redirect: 'manual' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/\/$/)
  })

  it('should not redirect the _next/data request for that same page', async () => {
    // the page above is only ever redirected away from, so this is the
    // first request that actually compiles it in dev mode
    await retry(async () => {
      const res = await next.fetch(
        `/_next/data/${next.buildId}/foo/details.json`,
        { redirect: 'manual' }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.pageProps.routeType).toBe('foo')
    })
  })
})

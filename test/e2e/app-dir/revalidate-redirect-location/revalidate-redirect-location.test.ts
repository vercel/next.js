import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Background revalidation (stale-while-revalidate) and cached .meta files
// are production behaviors.
// @force-gate !dev
describe('revalidate-redirect-location', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should include Location header when redirect is cached during background revalidation', async () => {
    // 1. Initial request to /foo renders normal page (200) and gets cached.
    const res1 = await next.fetch('/foo', { redirect: 'manual' })
    expect(res1.status).toBe(200)

    // 2. Update redirects mapping to redirect /foo -> /target and mark 'redirects' tag as stale.
    const updateRes = await next.fetch('/api/redirects', {
      method: 'POST',
      body: JSON.stringify({ foo: '/target' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateRes.status).toBe(200)

    // 3. Next request serves stale page and triggers background revalidation.
    const res2 = await next.fetch('/foo', { redirect: 'manual' })
    expect(res2.status).toBe(200)

    // 4. Background revalidation writes new cache entry. Subsequent requests should
    // be 308 permanent redirect WITH a Location header.
    await retry(async () => {
      const res = await next.fetch('/foo', { redirect: 'manual' })
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('/target')
    })
  })

  it('should update Location header when an existing cached redirect changes destination', async () => {
    // 1. Setup /bar to redirect to /target?v=1
    const updateRes1 = await next.fetch('/api/redirects', {
      method: 'POST',
      body: JSON.stringify({ bar: '/target?v=1' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateRes1.status).toBe(200)

    // Render /bar initially
    await retry(async () => {
      const res = await next.fetch('/bar', { redirect: 'manual' })
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('/target?v=1')
    })

    // 2. Change /bar destination to /target?v=2 and mark stale
    const updateRes2 = await next.fetch('/api/redirects', {
      method: 'POST',
      body: JSON.stringify({ bar: '/target?v=2' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(updateRes2.status).toBe(200)

    // 3. Stale request serves old redirect (/target?v=1) and triggers revalidation
    const staleRes = await next.fetch('/bar', { redirect: 'manual' })
    expect(staleRes.status).toBe(308)

    // 4. Once background revalidation completes, Location header must be updated to /target?v=2
    await retry(async () => {
      const res = await next.fetch('/bar', { redirect: 'manual' })
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toBe('/target?v=2')
    })
  })
})

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Background revalidation only happens in production, and the fixture data is
// changed on disk while the server is running.
// @force-gate start
describe('redirect-background-revalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps the Location header when a page redirects during background revalidation', async () => {
    const res = await next.fetch('/foo', { redirect: 'manual' })
    expect(res.status).toBe(200)

    await next.patchFile('data/redirects.json', '{"foo": "/target"}')
    const revalidateRes = await next.fetch('/api/revalidate', {
      method: 'POST',
    })
    expect(revalidateRes.status).toBe(200)

    await retry(async () => {
      const res = await next.fetch('/foo', { redirect: 'manual' })
      expect(res.status).toBe(308)
      expect(res.headers.get('location')).toEqual(
        expect.stringMatching(/\/target$/)
      )
    })
  })
})

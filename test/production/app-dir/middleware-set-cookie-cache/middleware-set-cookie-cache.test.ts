import { nextTestSetup } from 'e2e-utils'

describe('middleware-set-cookie-cache', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Cache-Control is applied outside of the Next.js server when deployed, so
    // these assertions only hold for `next start`.
    skipDeployment: true,
  })

  if (skipped) return

  it('replaces a prerendered page cache-control with no-store when middleware sets a cookie', async () => {
    const res = await next.fetch('/with-cookie')
    expect(res.headers.get('set-cookie')).toContain('token=secret-user-token')
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
  })

  it('keeps the prerendered page cache-control when middleware sets no cookie', async () => {
    const res = await next.fetch('/no-cookie')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('cache-control')).toContain('s-maxage')
  })
})

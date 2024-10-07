import { nextTestSetup } from 'e2e-utils'

describe('no-duplicate-headers-next-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should prioritise headers in middleware for static assets', async () => {
    const res = await next.fetch('favicon.ico')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('max-age=1234')
  })
})

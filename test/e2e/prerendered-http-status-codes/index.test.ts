import { nextTestSetup } from 'e2e-utils'

// @force-gate TODO
describe('prerendered-http-status-codes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe.each(['with-suspense', 'without-suspense'])('%s', (variant) => {
    it('returns a 404 status for the not-found HTML response', async () => {
      const response = await next.fetch(`/${variant}/not-found`, {
        headers: { Accept: 'text/html' },
      })

      expect(response.headers.get('content-type')).toContain('text/html')
      expect(response.status).toBe(404)
    })

    it('returns a 307 status and location for the redirect', async () => {
      const response = await next.fetch(`/${variant}/redirect`, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      })

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('/')
    })
  })
})

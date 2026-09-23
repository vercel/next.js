import { nextTestSetup } from 'e2e-utils'

describe('prerendered-http-status-codes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe.each(['with-suspense', 'without-suspense'])('%s', (variant) => {
    it.each([
      { route: 'unauthorized', status: 401 },
      { route: 'forbidden', status: 403 },
      { route: 'not-found', status: 404 },
    ])(
      'returns $status for the $route HTML response',
      async ({ route, status }) => {
        const response = await next.fetch(`/${variant}/${route}`, {
          headers: { Accept: 'text/html' },
        })

        expect(response.headers.get('content-type')).toContain('text/html')
        expect(response.status).toBe(status)
      }
    )

    it.each([
      { route: 'redirect', status: 307 },
      { route: 'permanent-redirect', status: 308 },
    ])('returns $status and location for $route', async ({ route, status }) => {
      const response = await next.fetch(`/${variant}/${route}`, {
        headers: { Accept: 'text/html' },
        redirect: 'manual',
      })

      expect(response.status).toBe(status)
      expect(response.headers.get('location')).toBe('/')
    })
  })
})

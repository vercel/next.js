import { nextTestSetup } from 'e2e-utils'

describe('route-handler-compression', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['/', '/route', '/sitemap.xml'])(
    'compresses the response for %s',
    async (pathname) => {
      const response = await next.fetch(pathname, {
        headers: { 'accept-encoding': 'gzip' },
      })

      expect(response.headers.get('content-encoding')).toBe('gzip')

      if (pathname === '/route') {
        expect(response.headers.get('vary')).toContain('custom')
        expect(response.headers.get('vary')).toContain('Accept-Encoding')
      }
    }
  )
})

import { nextTestSetup } from 'e2e-utils'

describe('experimental.devCacheControlNoCache', () => {
  describe('when enabled', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should use no-cache instead of no-store for pages router', async () => {
      const res = await next.fetch('/pages-route')
      expect(res.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
    })

    it('should use no-cache instead of no-store for app router', async () => {
      const res = await next.fetch('/app-route')
      expect(res.headers.get('Cache-Control')).toBe('no-cache, must-revalidate')
    })
  })
})

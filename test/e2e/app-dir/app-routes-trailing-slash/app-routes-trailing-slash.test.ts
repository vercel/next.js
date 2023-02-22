import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-routes-trailing-slash',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work with node runtime', async () => {
      const res = await next.fetch('/api/')
      const html = await res.text()
      expect(html).toContain('Hello World')
    })

    it('should work edge node runtime', async () => {
      const res = await next.fetch('/api/edge/')
      const html = await res.text()
      expect(html).toContain('Hello World')
    })
  }
)

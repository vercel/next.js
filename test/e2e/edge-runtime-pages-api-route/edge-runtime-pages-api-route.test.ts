import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Edge runtime pages-api route',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work edge runtime', async () => {
      const res = await next.fetch('/api/edge')
      const text = await res.text()
      expect(text).toContain('All Good')
    })

    it('should work with node runtime', async () => {
      const res = await next.fetch('/api/node')
      const text = await res.text()
      expect(text).toContain('All Good')
    })
  }
)

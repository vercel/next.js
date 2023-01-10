import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'fetch failures have good stack traces in edge runtime',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work with fetch', async () => {
      const res = await next.fetch('/api/unknown-domain')
      expect(res.status).toBe(500)
      const html = await res.text()
      expect(html).toContain(`(middleware)/./pages/api/unknown-domain.js`)
      expect(html).toContain(`(middleware)/./src/fetcher.js`)
      expect(html).toContain(`anotherFetcher`)
    })
  }
)

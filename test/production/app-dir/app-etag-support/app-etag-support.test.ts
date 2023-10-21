import { createNextDescribe } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

createNextDescribe(
  'app-etag-support',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should generate the same etag during export and after revalidate', async () => {
      const initialRes = await next.fetch('isr')
      expect(initialRes.status).toBe(200)
      const etag = initialRes.headers.get('etag')
      await waitFor(2000)

      const revalidatedRes = await next.fetch('isr', {
        headers: { 'If-None-Match': etag },
      })
      expect(revalidatedRes.status).toBe(304)
    })

    it('should write status: 200 to meta file when revalidating', async () => {
      const initialRes = await next.fetch('isr')
      expect(initialRes.status).toBe(200)
      const etag = initialRes.headers.get('etag')
      await waitFor(2000)
      const revalidatedRes = await next.fetch('isr', {
        headers: { 'If-None-Match': etag },
      })
      expect(revalidatedRes.status).toBe(304)
      const postRevalidateRes = await next.fetch('isr')
      expect(postRevalidateRes.status).toBe(200)
    })
  }
)

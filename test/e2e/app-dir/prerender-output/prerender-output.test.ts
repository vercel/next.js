import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Requires local production ISR and a writable fixture data file.
// @force-gate start
describe('prerender-output', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('caches status and Location independently of the completed response', async () => {
    const initial = await next.fetch('/changing')
    expect(initial.status).toBe(200)
    expect(await initial.text()).toContain('changing')

    for (const destination of ['/first', '/second']) {
      const update = await next.fetch('/api/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ changing: destination }),
      })
      expect(update.status).toBe(200)
      // Serve the stale cache entry and start background revalidation against
      // a response whose headers have already been sent.
      await next.fetch('/changing', { redirect: 'manual' })
      await retry(async () => {
        const response = await next.fetch('/changing', { redirect: 'manual' })
        expect(response.status).toBe(308)
        expect(response.headers.get('location')).toBe(destination)
      })
      const cached = await next.fetch('/changing', { redirect: 'manual' })
      expect(cached.status).toBe(308)
      expect(cached.headers.get('location')).toBe(destination)
    }
  })
})

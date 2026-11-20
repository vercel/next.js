import { randomUUID } from 'node:crypto'
import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

// Production resumes the cached HTML prelude before the delayed cache read.
// @force-gate !dev
describe('use cache streaming revalidation', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['html', 'flight'] as const)(
    'completes stale regeneration started during a streaming %s response',
    async (protocol) => {
      const key = randomUUID()
      async function readValue() {
        const startedAt = performance.now()
        const path = `/${key}/${randomUUID()}`
        let value: string
        if (protocol === 'html') {
          const html = await next.render$(path)
          value = html('#value').text()
        } else {
          const response = await next.fetch(path, { headers: { RSC: '1' } })
          expect(response.status).toBe(200)
          expect(response.headers.get('content-type')).toContain(
            'text/x-component'
          )
          const flight = await response.text()
          value = flight.match(new RegExp(`${key}:[a-f0-9-]{36}`))?.[0] ?? ''
        }
        expect(value).not.toBe('')
        return { value, duration: performance.now() - startedAt }
      }

      const { value: initialValue } = await readValue()
      expect((await readValue()).value).toBe(initialValue)
      // Let the ten-second revalidation interval pass without making requests.
      await waitFor(11000)
      const stale = await readValue()

      // Both handlers retain stale entries until expire. This request must
      // serve the old value without waiting for regeneration.
      expect(stale.value).toBe(initialValue)
      expect(stale.duration).toBeLessThan(5000)

      // Requests during this interval could let an untracked regeneration run
      // under another invocation.
      await waitFor(8000)
      const regenerated = await readValue()
      expect(regenerated.value).not.toBe(initialValue)
      // A cache miss would run the five-second generation during this request.
      // Reject that case even if it produces a different value.
      expect(regenerated.duration).toBeLessThan(5000)
    }
  )
})

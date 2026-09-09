import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-route-handler-tags', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  const retryDuration = isNextDeploy ? 30_000 : 3_000

  async function readCachedValue(): Promise<number> {
    const response = await next.fetch('/cached')
    expect(response.status).toBe(200)

    if (!isNextDev) {
      // Verify that the response itself is cached, not just the function's
      // return value. On Vercel this must be a hit in the deployed ISR cache.
      const cacheHeader = isNextDeploy ? 'x-vercel-cache' : 'x-nextjs-cache'
      expect(response.headers.get(cacheHeader)).toBe('HIT')
    }

    const { value } = await response.json()
    expect(value).toEqual(expect.any(Number))
    return value
  }

  it('propagates cacheTag to prerendered and regenerated ISR entries', async () => {
    let value = await retry(readCachedValue, retryDuration)
    expect(await readCachedValue()).toBe(value)

    // Invalidate both the build-time entry and the entry produced by ISR.
    for (const entry of ['prerendered', 'regenerated']) {
      const response = await next.fetch('/revalidate', { method: 'POST' })
      expect(response.status).toBe(204)

      const previousValue = value

      // Tag invalidation and regeneration can take time to propagate on Vercel.
      value = await retry(
        async () => {
          const updatedValue = await readCachedValue()
          expect(updatedValue).not.toBe(previousValue)
          return updatedValue
        },
        retryDuration,
        500,
        `invalidate the ${entry} route handler entry`
      )

      expect(await readCachedValue()).toBe(value)
    }
  })
})

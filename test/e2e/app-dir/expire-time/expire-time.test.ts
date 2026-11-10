import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('expire-time', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  // On Vercel, ISR cache decisions happen at the Proxy layer. The Vercel
  // builder reads the route's `expire` value (Next.js's `initialExpireSeconds`
  // in the prerender manifest, which the build derives from `expireTime` when
  // no explicit `cacheLife` expire is set) and passes it to the Proxy as
  // `staleExpiration`. The Proxy is also expected, once implemented, to read
  // updated values from Next.js's `stale-while-revalidate` response header on
  // subsequent revalidations. Today the Proxy ignores the expire value entirely
  // and treats it as one year. Past `expireTime` it serves stale with a
  // background revalidation instead of a blocking prerender. When Proxy is
  // updated to honor the expire value, this test will start passing in deploy
  // mode and `it.failing` will itself fail. That's the signal to flip it back
  // to `it`.
  const itFailsWhenDeployed = isNextDeploy ? it.failing : it

  /* eslint-disable jest/no-standalone-expect */
  itFailsWhenDeployed(
    'should do a blocking revalidation when the cache entry has expired',
    async () => {
      const $first = await next.render$('/')
      const v1 = $first('#value').text()
      expect(v1).toBeDateString()

      // The first request might trigger a background revalidation if the
      // prerender document is already older than the configured revalidate
      // time. So we refetch until we get a different value than the first one.
      let v2: string
      await retry(
        async () => {
          const $second = await next.render$('/')
          v2 = $second('#value').text()
          expect(v2).toBeDateString()
          expect(v2).not.toBe(v1)
        },
        4_000,
        200
      )

      // Wait past the `expireTime` (10 s). The next request must trigger a
      // blocking prerender, not stale-while-revalidate — so the response
      // returned right here carries a freshly-computed value.
      await new Promise((resolve) => setTimeout(resolve, 10_000))

      const $third = await next.render$('/')
      const v3 = $third('#value').text()
      expect(v3).toBeDateString()

      // This should be a new value, not the expired previous one, and
      // especially not the expired prerendered one.
      expect(v3).not.toBe(v2)
      expect(v3).not.toBe(v1)
      console.log({ v1, v2, v3 })
    }
  )
  /* eslint-enable jest/no-standalone-expect */
})

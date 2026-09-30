import { wait } from 'next/dist/lib/wait'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('expire-time', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should do a blocking revalidation when the cache entry has expired', async () => {
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
    await wait(10_000)

    const $third = await next.render$('/')
    const v3 = $third('#value').text()
    expect(v3).toBeDateString()

    // This should be a new value, not the expired previous one, and
    // especially not the expired prerendered one.
    expect(v3).not.toBe(v2)
    expect(v3).not.toBe(v1)
    console.log({ v1, v2, v3 })
  })
})

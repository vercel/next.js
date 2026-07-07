import { nextTestSetup } from 'e2e-utils'

// Lives under `test/production` so it only runs in `next start` mode. In dev
// mode the default in-memory `'use cache'` handler would return the cached
// function value on re-render (we don't fake time for the function-level
// cache), so the observable wouldn't change even when the ISR layer does a
// blocking revalidation. Deploy mode is also out of scope: on Vercel the ISR
// cache decision is made at the Proxy layer before the lambda runs, and
// Proxy-side behavior is covered by Proxy's own tests. The companion suite
// `test/e2e/app-dir/expire-time` covers the same `IncrementalCache` /
// response-cache change via classic ISR (no `use cache`, no custom handler,
// short `expireTime`) and runs in deploy mode.
describe('use-cache-expire', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function expectBlockingRevalidation(path: string) {
    const $first = await next.render$(path)
    const v0 = $first('#value').text()
    expect(v0).toBeTruthy()

    const $second = await next.render$(path, undefined, {
      // Shift the ISR entry's `lastModified` past `expire` (301 s). Once past
      // `expire`, the next request must trigger a blocking prerender — not
      // stale-while-revalidate — so the response carries a freshly-computed
      // value rather than the previous cached one.
      headers: { 'x-test-cache-age-offset-ms': String(301 * 1000) },
    })
    const v1 = $second('#value').text()

    expect(v1).not.toBe(v0)
  }

  it('should blocking-revalidate a fully static shell past expire', async () => {
    await expectBlockingRevalidation('/static')
  })

  it('should blocking-revalidate a partially-static route shell past expire', async () => {
    // Hits the prerendered route shell for the known `generateStaticParams`
    // entry, whose static portion contains the cached `getValue()`.
    await expectBlockingRevalidation('/partially-static/known')
  })

  it('should blocking-revalidate a partially-static fallback shell past expire', async () => {
    // Hits the fallback shell for an unknown param (not in
    // `generateStaticParams`). The cached `getValue()` lives above the Suspense
    // boundary in the fallback shell itself, so the same past-expire blocking
    // behavior must apply there too.
    await expectBlockingRevalidation('/partially-static/unknown')
  })
})

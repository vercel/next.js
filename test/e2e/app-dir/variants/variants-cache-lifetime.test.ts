import { isNextStart, nextTestSetup } from 'e2e-utils'

describe('variants with a cache lifetime per combination', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/cache-lifetime',
    // The proxy rewrites to an internal `/__variants/<hash>` path, which the
    // Next.js router strips before it matches a route. Deployments route at the
    // CDN instead, and the build output declares nothing for that prefix, so
    // the rewritten request resolves to the 404 route. Enable once the build
    // output carries the prefix.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should resolve the variant the cache lifetime is selected from', async () => {
    const $ = await next.render$('/lifetime/a', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  if (isNextStart) {
    it('should give each combination its own cache lifetime', async () => {
      // Reading a variant inside `'use cache'` is rejected, so the value is
      // read outside and passed in. The `cacheLife` it selects propagates to
      // the document, so two combinations of one route expire differently and
      // each needs its own prerender manifest entry to say so.
      const dark = await next.fetch('/lifetime/a', {
        headers: { cookie: 'theme=dark' },
      })

      expect(await dark.text()).toContain('<p id="theme">dark</p>')
      expect(dark.headers.get('cache-control')).toContain('s-maxage=3600')

      const light = await next.fetch('/lifetime/a', {
        headers: { cookie: 'theme=light' },
      })

      expect(await light.text()).toContain('<p id="theme">light</p>')
      expect(light.headers.get('cache-control')).toContain('s-maxage=60')
    })
  }
})

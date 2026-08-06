import { isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { hashVariants } from 'next/dist/server/variants/hash'

import { basePath, url } from './base-path'

describe('variants with a cache lifetime per combination', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/cache-lifetime',
    skipDeployment: false,
    // Handed to the build rather than read from `process.env` there, so that a
    // deployed build receives it too: only what goes through here is forwarded
    // to the remote build.
    env: basePath ? { BASE_PATH: basePath } : undefined,
  })

  if (skipped) {
    return
  }

  it('should resolve a variant while revalidating a stale prerender', async () => {
    // Revalidating rebuilds the request the origin sees, and a variant value
    // has to survive that rebuild the same way it survives the first render.
    // Nothing else in the suite lets an entry go stale, so this is the only
    // place that path is taken: the tag makes it immediate rather than
    // waiting out the route's lifetime.
    const before = await next.render$(url('/lifetime/r'), undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect(before('#theme').text()).toBe('dark')

    const renderedAt = before('#rendered-at').text()
    expect(renderedAt).not.toBe('')

    const revalidateRes = await next.fetch(url('/revalidate?tag=lifetime-r'))
    expect(revalidateRes.status).toBe(200)

    // Waits for the entry to actually be replaced, which the variant value
    // cannot show because it is `dark` before and after. A response still
    // carrying the old stamp is the stale one being served while the
    // revalidation runs behind it, and asserting on that would pass without
    // the revalidating render ever having happened.
    await retry(async () => {
      const after = await next.render$(url('/lifetime/r'), undefined, {
        headers: { cookie: 'theme=dark' },
      })

      expect(after('#rendered-at').text()).not.toBe(renderedAt)

      // The point of the test: the render that produced the replacement still
      // resolved the variant.
      expect(after('#theme').text()).toBe('dark')
    })
  })

  it('should resolve the variant the cache lifetime is selected from', async () => {
    const $ = await next.render$(url('/lifetime/a'), undefined, {
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
      const dark = await next.fetch(url('/lifetime/a'), {
        headers: { cookie: 'theme=dark' },
      })

      expect(await dark.text()).toContain('<p id="theme">dark</p>')
      expect(dark.headers.get('cache-control')).toContain('s-maxage=3600')

      const light = await next.fetch(url('/lifetime/a'), {
        headers: { cookie: 'theme=light' },
      })

      expect(await light.text()).toContain('<p id="theme">light</p>')
      expect(light.headers.get('cache-control')).toContain('s-maxage=60')
    })

    it('should describe the prerender that omits variants on the clean path', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      const lifetimeOf = (route: string) =>
        prerenderManifest.routes[route]?.initialRevalidateSeconds

      // The clean path is not a stand-in for the combinations: it holds the
      // prerender that omits every variant, and that render never reaches the
      // `cacheLife` call because the value selecting it is a hole. So its
      // lifetime is the default rather than either combination's, and an entry
      // means what the render under it produced.
      expect(lifetimeOf('/lifetime/a')).toBe(false)

      expect(
        lifetimeOf(
          `/__variants/${hashVariants({ 'theme@variants.ts': 'dark' })}/lifetime/a`
        )
      ).toBe(3600)

      expect(
        lifetimeOf(
          `/__variants/${hashVariants({ 'theme@variants.ts': 'light' })}/lifetime/a`
        )
      ).toBe(60)
    })
  }
})

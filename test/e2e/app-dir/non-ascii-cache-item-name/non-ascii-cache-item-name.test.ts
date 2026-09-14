import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Cache metadata reaches a cache implementation through HTTP request headers,
// whose values are limited to Latin-1. Every tag, soft tag, and cache item name
// therefore has to be representable there. A value that is not gets lost before
// it reaches the cache, so the entry is never found and never stored, and the
// route calls the origin on every render without reporting an error.
//
// `unstable_cache` assembles its item name from the request URL and the name of
// the cached callback, so the fixture covers those two parts on separate
// routes. `/[slug]` is requested with a non-ASCII segment and a non-ASCII query
// parameter and holds an anonymous callback. `/named-callback` is requested
// under a pure ASCII URL and holds a callback whose name is non-ASCII. A
// failure therefore names the part of the item name it comes from.
describe('non-ASCII cache item name', () => {
  const { next, isNextDeploy, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  const urlPath = `/${encodeURIComponent('odzież')}?q=${encodeURIComponent('模型')}`
  const namedCallbackPath = '/named-callback'
  const loneSurrogatePath = '/lone-surrogate'

  async function readValues() {
    const $ = await next.render$(urlPath)
    const values = {
      cached: $('#cached').text(),
      fetched: $('#fetched').text(),
    }

    // Both entries hold a random number. Asserting the shape keeps a render
    // that produced neither from reading as two equal results.
    for (const value of Object.values(values)) {
      expect(value).toMatch(/^0\.\d+$/)
    }

    return values
  }

  async function expectEveryValueRepresentable(requestPath: string) {
    const outputIndex = next.cliOutput.length

    const res = await next.fetch(requestPath)
    expect(res.status).toBe(200)

    await retry(async () => {
      // Without this the assertion would also hold when the handler is never
      // consulted at all.
      expect(next.cliOutput.slice(outputIndex)).toContain('CACHE_PROBE get')
    })

    expect(next.cliOutput.slice(outputIndex)).not.toContain(
      'CACHE_PROBE unsafe'
    )
  }

  if (isNextDeploy) {
    it('keeps caching a request with a non-ASCII query parameter', async () => {
      // The real cache implementation performs the conversion, so an item name
      // it cannot carry surfaces as a cache that never returns anything: the
      // entry is recomputed and the rendered value changes on every request.
      // The fetched value has to stay put throughout, which separates a broken
      // item name from a cache that is down.
      //
      // Only the URL route is covered here. A production build renames the
      // callback on the other one, which leaves nothing unrepresentable in its
      // item name.
      await readValues()

      await retry(async () => {
        const first = await readValues()
        const second = await readValues()

        expect(second).toEqual(first)
      })
    })
  } else {
    it('encodes a non-ASCII query parameter in the item name', async () => {
      await expectEveryValueRepresentable(urlPath)
    })

    it('encodes a lone surrogate in the callback name', async () => {
      // `encodeURIComponent` rejects a lone surrogate, which fails the render
      // instead of the cache read. The response is still a 200 that carries an
      // error, so the assertion has to be on the rendered output.
      const $ = await next.render$(loneSurrogatePath)

      expect($('#cached').text()).toMatch(/^0\.\d+$/)
    })

    // A production build renames the callback, which leaves nothing
    // unrepresentable in its item name, so the constraint is only observable in
    // development.
    if (isNextDev) {
      it('encodes a non-ASCII callback name in the item name', async () => {
        await expectEveryValueRepresentable(namedCallbackPath)
      })
    }
  }
})

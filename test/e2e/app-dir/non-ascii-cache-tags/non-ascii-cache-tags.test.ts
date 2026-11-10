import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/93142
//
// Any non-ASCII character (Hebrew, Arabic, CJK, emoji, …) in a cache tag —
// whether it's a path-derived implicit tag or a user-supplied tag from
// `cacheTag()`, `unstable_cache({tags})`, or `fetch({next:{tags}})` — gets
// written into the internal `x-next-cache-tags` HTTP header on ISR responses.
// Node's `validateHeaderValue` rejects any byte outside `\t\x20-\x7e`, so the
// response crashes with `ERR_INVALID_CHAR`.
//
// On Vercel deploy stale-if-error masks the 500 from clients, but revalidation
// itself keeps failing and the cache stops refreshing for affected routes. The
// revalidate / updateTag cases here cover that round-trip: a cached entry keyed
// under a non-ASCII path / tag must actually be invalidated by
// `revalidatePath`, `revalidateTag`, or `updateTag` against each cache backend.
describe('non-ASCII cache tags', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  const SLUG = '🎉'
  const TAG = '🎂'
  const FETCH_TAG = '🌮'
  const UNSTABLE_TAG = '🌶'
  const PATH = `/${encodeURIComponent(SLUG)}`

  it('serves a non-ASCII slug ISR page without ERR_INVALID_CHAR', async () => {
    const res = await next.fetch(PATH)
    expect(res.status).toBe(200)

    if (isNextDeploy) {
      const tags = res.headers.get('x-next-cache-tags')
      if (tags !== null) {
        // Anything outside the validation character class would have
        // crashed `setHeader` on the way out, so reaching the client at
        // all is itself a signal — but assert explicitly to guard format.
        expect(tags).toMatch(/^[\t\x20-\x7e]+$/)
      }
    }
  })

  it('invalidates a cached entry via revalidatePath with a non-ASCII path', async () => {
    const initial = (await next.render$(PATH))('#cached-time').text()

    const res = await next.fetch(
      `/api/revalidate?path=${encodeURIComponent(`/${SLUG}`)}`,
      { method: 'POST' }
    )
    expect(res.status).toBe(200)

    // Revalidation may take a moment to propagate.
    await retry(async () => {
      const after = (await next.render$(PATH))('#cached-time').text()
      expect(after).not.toBe(initial)
    })
  })

  it('invalidates a cached entry via revalidateTag with a non-ASCII tag', async () => {
    const initial = (await next.render$(PATH))('#cached-time').text()

    const res = await next.fetch(
      `/api/revalidate?tag=${encodeURIComponent(TAG)}`,
      { method: 'POST' }
    )
    expect(res.status).toBe(200)

    await retry(async () => {
      const after = (await next.render$(PATH))('#cached-time').text()
      expect(after).not.toBe(initial)
    })
  })

  it('invalidates a fetch entry tagged with a non-ASCII tag via revalidateTag', async () => {
    const initial = (await next.render$(PATH))('#fetched').text()

    const res = await next.fetch(
      `/api/revalidate?tag=${encodeURIComponent(FETCH_TAG)}`,
      { method: 'POST' }
    )
    expect(res.status).toBe(200)

    await retry(async () => {
      const after = (await next.render$(PATH))('#fetched').text()
      expect(after).not.toBe(initial)
    })
  })

  it('invalidates an `unstable_cache` entry tagged with a non-ASCII tag via revalidateTag', async () => {
    const initial = (await next.render$(PATH))('#unstable-cached-time').text()

    const res = await next.fetch(
      `/api/revalidate?tag=${encodeURIComponent(UNSTABLE_TAG)}`,
      { method: 'POST' }
    )
    expect(res.status).toBe(200)

    await retry(async () => {
      const after = (await next.render$(PATH))('#unstable-cached-time').text()
      expect(after).not.toBe(initial)
    })
  })

  it('invalidates a cached entry via updateTag with a non-ASCII tag (Server Action)', async () => {
    const browser = await next.browser(PATH)
    const initial = await browser.elementByCss('#cached-time').text()

    await browser.elementByCss('#update-tag').click()

    await retry(async () => {
      const after = await browser.elementByCss('#cached-time').text()
      expect(after).not.toBe(initial)
    })
  })
})

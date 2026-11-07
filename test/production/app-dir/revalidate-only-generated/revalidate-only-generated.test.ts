import { nextTestSetup } from 'e2e-utils'

describe('revalidate-only-generated', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // A request that never answers fails the test instead of the run.
  const withTimeout = () => ({ signal: AbortSignal.timeout(30_000) })

  // With `unstable_onlyGenerated` a path without a cache entry answers 404
  // instead of rendering, and `res.revalidate()` resolves. The 404 renders the
  // not-found page, which has no cache entry in this app either. With Cache
  // Components it has a prerendered shell instead.
  it('answers when the path and the not-found page have no cache entry', async () => {
    const res = await next.fetch('/api/revalidate?path=/items/1', withTimeout())
    expect(await res.json()).toEqual({ revalidated: true })

    const $ = await next.render$('/items/1', undefined, withTimeout())
    expect($('#route').text()).toBe('item 1')
  })

  // A generated Pages Router path has a cache entry, so it is rendered. When
  // its `getStaticProps` returns `notFound: true` now, the answer is the same
  // not-found page.
  it('answers when a generated Pages Router path is not found anymore', async () => {
    const $ = await next.render$('/posts/1', undefined, withTimeout())
    expect($('#post').text()).toBe('post 1')

    await next.patchFile('post-removed.txt', '')

    const res = await next.fetch('/api/revalidate?path=/posts/1', withTimeout())
    expect(await res.json()).toEqual({ revalidated: true })

    const page = await next.fetch('/posts/1', withTimeout())
    expect(page.status).toBe(404)
  })
})

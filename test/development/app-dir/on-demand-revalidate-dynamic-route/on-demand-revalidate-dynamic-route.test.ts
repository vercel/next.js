import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('on-demand-revalidate-dynamic-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // A request that never answers fails its test instead of the run.
  const withTimeout = () => ({ signal: AbortSignal.timeout(30_000) })

  async function revalidate(path: string, { onlyGenerated = false } = {}) {
    const res = await next.fetch(
      `/api/revalidate?path=${encodeURIComponent(path)}${
        onlyGenerated ? '&onlyGenerated=1' : ''
      }`,
      withTimeout()
    )

    return res.json()
  }

  // `res.revalidate()` renders the path inside the server, without the router
  // that finds the route of a browser request. None of these routes was
  // requested before, so the server also has to compile them.
  it.each([
    { router: 'App Router', path: '/items/1' },
    { router: 'Pages Router', path: '/legacy/1' },
  ])('revalidates a dynamic $router page', async ({ path }) => {
    expect(await revalidate(path)).toEqual({ revalidated: true })
  })

  // With `unstable_onlyGenerated` a path without a cache entry answers 404
  // instead of rendering, and `res.revalidate()` resolves. `next dev` keeps no
  // cache entries, so that is the answer for a path that was rendered too.
  describe.each([
    { route: 'dynamic App Router page', path: '/items/2', text: 'app page 2' },
    { route: 'static App Router page', path: '/about', text: 'about' },
    {
      route: 'dynamic Pages Router page',
      path: '/legacy/2',
      text: 'pages page 2',
    },
  ])('with unstable_onlyGenerated for a $route', ({ path, text }) => {
    it('answers for a path that was not rendered', async () => {
      expect(await revalidate(path, { onlyGenerated: true })).toEqual({
        revalidated: true,
      })
    })

    it('answers for a path that was rendered', async () => {
      const $ = await next.render$(path, undefined, withTimeout())
      expect($('#route').text()).toBe(text)

      expect(await revalidate(path, { onlyGenerated: true })).toEqual({
        revalidated: true,
      })
    })
  })

  it('revalidates a dynamic page that is added while the server runs', async () => {
    await next.patchFile(
      'app/posts/[slug]/page.tsx',
      `export default async function Page({
        params,
      }: {
        params: Promise<{ slug: string }>
      }) {
        return <p id="route">post {(await params).slug}</p>
      }
      `
    )

    await retry(async () => {
      expect(await revalidate('/posts/first')).toEqual({ revalidated: true })
    })

    const $ = await next.render$('/posts/first', undefined, withTimeout())
    expect($('#route').text()).toBe('post first')
  })
})

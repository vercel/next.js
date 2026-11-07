import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('on-demand-revalidate-dynamic-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function revalidate(path: string) {
    const res = await next.fetch(
      `/api/revalidate?path=${encodeURIComponent(path)}`
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

    const $ = await next.render$('/posts/first')
    expect($('#route').text()).toBe('post first')
  })
})

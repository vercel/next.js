import { nextTestSetup } from 'e2e-utils'

const PAGE_COUNT = 20

describe('prerender-manifest-concurrent-compiles', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Every cold compile of a route with generateStaticParams records the route
  // in the dev prerender manifest. When those compiles run concurrently, their
  // updates must neither drop each other's entries nor leave a corrupt file.
  it('should record every route when they compile concurrently', async () => {
    const pathnames = Array.from(
      { length: PAGE_COUNT },
      (_, i) => `/en/page-${i + 1}`
    )

    const statuses = await Promise.all(
      pathnames.map(async (pathname) => (await next.fetch(pathname)).status)
    )
    expect(statuses).toEqual(pathnames.map(() => 200))

    const manifest = await next.readJSON('.next/dev/prerender-manifest.json')
    expect(Object.keys(manifest.dynamicRoutes).sort()).toEqual(
      pathnames.map((_, i) => `/[lang]/page-${i + 1}`).sort()
    )

    // A corrupt manifest fails every later request, not only the concurrent
    // ones, so check that a fresh route still renders.
    expect((await next.fetch('/fr/page-1')).status).toBe(200)
  })
})

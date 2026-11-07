import { nextTestSetup } from 'e2e-utils'

describe('nsec-105-opengraph-image-dynamicparams', () => {
  if (
    process.env.__NEXT_CACHE_COMPONENTS === 'true' ||
    process.env.__NEXT_EXPERIMENTAL_CACHE_COMPONENTS === 'true' ||
    process.env.__NEXT_EXPERIMENTAL_PPR === 'true'
  ) {
    // The dynamicParams segment config is rejected at build time when cache
    // components is enabled, and legacy PPR serves unlisted params with a
    // 200 shell instead of a 404 for the page, so this scenario only exists
    // in plain non-PPR production mode.
    test.skip('only applicable without cache components / legacy PPR', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('serves the listed slug on the page, route handler, and opengraph-image', async () => {
    const pageRes = await next.fetch('/public-post')
    expect(pageRes.status).toBe(200)

    const dataRes = await next.fetch('/public-post/data')
    expect(dataRes.status).toBe(200)
    expect(await dataRes.text()).toBe('route:public:Public quarterly update')

    const ogRes = await next.fetch('/public-post/opengraph-image')
    expect(ogRes.status).toBe(200)
    expect(await ogRes.text()).toBe(
      'og:public:Public quarterly update:Public summary only'
    )
  })

  it('returns 404 for an unlisted slug on the page and route handler', async () => {
    const pageRes = await next.fetch('/acquisition-draft')
    expect(pageRes.status).toBe(404)

    const dataRes = await next.fetch('/acquisition-draft/data')
    expect(dataRes.status).toBe(404)
  })

  it('returns 404 for an unlisted slug on opengraph-image when dynamicParams is false', async () => {
    const ogRes = await next.fetch('/acquisition-draft/opengraph-image')
    expect(ogRes.status).toBe(404)
  })
})

import { nextTestSetup } from 'e2e-utils'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

describe('conflicting routes', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  // The server will reject prefetch requests that don't set a cache-busting
  // search param.
  // TODO: We should try to avoid unit tests that simulate internal client
  // router requests. There are only a handful of cases that do this currently.
  // In the meantime, consider moving this into a shared testing utility.
  async function segmentPrefetch(url: string, segmentPath: string) {
    const fetchUrl = new URL(url, 'http://localhost')
    const searchParams = new URLSearchParams(fetchUrl.search)
    searchParams.set(
      '_rsc',
      computeCacheBustingSearchParam('1', segmentPath, undefined, undefined)
    )
    fetchUrl.search = searchParams.toString()
    return await next.fetch(fetchUrl.pathname + fetchUrl.search, {
      headers: {
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': segmentPath,
      },
    })
  }

  it.each([
    '/en/vercel/~/monitoring',
    '/fr/vercel/~/monitoring',
    '/es/vercel/~/monitoring',
  ])('%s matches the right route', async (path) => {
    const res = await segmentPrefetch(path, '/_tree')
    expect(res.status).toBe(200)

    if (isNextDeploy) {
      expect(res.headers.get('x-matched-path')).toBe(
        '/[lang]/[teamSlug]/~/monitoring.prefetch.rsc'
      )
    }
  })

  it('matches the right route when the original route has no dynamic params, is dynamic, and PPR is disabled', async () => {
    const res = await segmentPrefetch('/prefetch-tests/dynamic', '/_tree')
    expect(res.status).toBe(200)

    if (isNextDeploy) {
      expect(res.headers.get('x-matched-path')).toBe(
        '/prefetch-tests/dynamic.prefetch.rsc'
      )
    }
  })

  it('handles conflict between App Router and Pages Router routes', async () => {
    const res = await segmentPrefetch('/new/templates', '/_tree')

    expect(res.status).toBe(200)
    expect(await res.text()).toContain(
      // when deployed we map to an empty object to signal to
      // client router it should MPA navigate
      isNextDeploy ? '{}' : '/new/templates/[[...slug]].js'
    )
  })
})

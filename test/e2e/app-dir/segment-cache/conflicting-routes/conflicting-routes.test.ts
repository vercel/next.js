import { nextTestSetup } from 'e2e-utils'

describe('conflicting routes', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('prefetching is disabled', () => {})
    return
  }

  it.each([
    '/en/vercel/~/monitoring',
    '/fr/vercel/~/monitoring',
    '/es/vercel/~/monitoring',
  ])('%s matches the right route', async (path) => {
    const res = await next.fetch(path, {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/_tree',
      },
    })

    expect(res.status).toBe(200)

    if (isNextDeploy) {
      expect(res.headers.get('x-matched-path')).toBe(
        '/[lang]/[teamSlug]/~/monitoring.prefetch.rsc'
      )
    }
  })

  it('matches the right route when the original route has no dynamic params, is dynamic, and PPR is disabled', async () => {
    if (isNextDeploy) {
      // TODO: Temporarily disabled until corresponding fix in Vercel builder
      // (https://github.com/vercel/vercel/pull/13275) is released.
      return
    }

    const res = await next.fetch('/prefetch-tests/dynamic', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/_tree',
      },
    })

    expect(res.status).toBe(200)

    if (isNextDeploy) {
      expect(res.headers.get('x-matched-path')).toBe(
        '/prefetch-tests/dynamic.prefetch.rsc'
      )
    }
  })
})

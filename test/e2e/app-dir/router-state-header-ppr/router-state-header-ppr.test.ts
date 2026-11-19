import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import type { FlightRouterState } from 'next/dist/shared/lib/app-router-types'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

const pathname = '/router-state-header-ppr'

// Router state for `pathname`. Typed so that it fails to compile when the
// router state shape changes.
const validStateTree: FlightRouterState = [
  '',
  {
    children: ['router-state-header-ppr', { children: ['__PAGE__', {}] }],
  },
]

// The same router state in the shape Next.js 15 sent, with a boolean
// `isRootLayout` flag at index 4. Tabs still running an older build send this
// after a deployment. It intentionally doesn't match the current type.
const legacyStateTree = [
  '',
  {
    children: [
      'router-state-header-ppr',
      { children: ['__PAGE__', {}, null, null] },
      null,
      null,
    ],
  },
  null,
  null,
  true,
]

async function fetchWithRouterState(
  next: ReturnType<typeof nextTestSetup>['next'],
  stateTree: unknown
) {
  const encoded = encodeURIComponent(JSON.stringify(stateTree))
  const url = new URL(pathname, 'http://localhost')
  const cacheBustingParam = await computeCacheBustingSearchParam(
    undefined,
    undefined,
    encoded,
    undefined
  )
  if (cacheBustingParam) {
    url.searchParams.set('_rsc', cacheBustingParam)
  }
  return next.fetch(url.pathname + url.search, {
    headers: { rsc: '1', 'next-router-state-tree': encoded },
  })
}

// After a static route becomes partially prerendered, RSC navigations render
// its dynamic content with the client's router state.
//
// The legacy (non-adapter) builder omits the RSC continuation for static build
// outputs, so like `static-to-partial-rsc`, deployments run only with the
// adapter.
// @force-gate !deploy || adapter
describe('router state header on a partially prerendered route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  beforeAll(async () => {
    const revalidation = await next.fetch(`${pathname}/revalidate`, {
      method: 'POST',
    })
    if (revalidation.status !== 200) {
      throw new Error(`Revalidation failed with ${revalidation.status}`)
    }

    // Wait for the regenerated, partially prerendered entry.
    await retry(async () => {
      const $ = await next.render$(pathname)
      expect($('#caller').text()).toBe('Caller: none')
    }, 10_000)
  })

  it('should not fail on a router state tree sent by an older Next.js version', async () => {
    const res = await fetchWithRouterState(next, legacyStateTree)

    // Adapter deployments currently respond to this navigation without
    // rejecting the legacy header. It must still not fail the request.
    if (await gate('deploy')) {
      expect(res.status).not.toBe(500)
      return
    }

    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(await res.text()).toBe('Bad Request')
  })

  it('should accept a valid router state tree', async () => {
    const res = await fetchWithRouterState(next, validStateTree)
    expect(res.status).toBe(200)
  })
})

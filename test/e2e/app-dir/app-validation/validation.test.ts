import { nextTestSetup } from 'e2e-utils'
import {
  computeCacheBustingSearchParam,
  computeLegacyCacheBustingSearchParam,
} from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

// Builds a router state tree for `/<prefix...>/<slug>`, where `<slug>` is a
// dynamic `[slug]` segment.
function createStateTree(
  prefixSegments: string[],
  slug: string,
  { legacy }: { legacy: boolean }
): string {
  // Next.js 15 encoded dynamic segments as a 3-tuple and sent a boolean
  // `isRootLayout` flag at index 4. Tabs that are still running an older
  // build send this shape after a deployment.
  let tree: unknown[] = legacy
    ? [['slug', slug, 'd'], { children: ['__PAGE__', {}] }, null, null]
    : [['slug', slug, 'd', null], { children: ['__PAGE__', {}] }]

  for (const segment of [...prefixSegments].reverse()) {
    tree = [segment, { children: tree }]
  }

  const root = legacy
    ? ['', { children: tree }, null, null, true]
    : ['', { children: tree }]
  return encodeURIComponent(JSON.stringify(root))
}

async function fetchWithRouterState(
  next: ReturnType<typeof nextTestSetup>['next'],
  pathname: string,
  stateTree: string,
  { rsc = true }: { rsc?: boolean } = {}
) {
  const url = new URL(pathname, 'http://localhost')
  const cacheBustingParam = await computeCacheBustingSearchParam(
    undefined,
    undefined,
    stateTree,
    undefined
  )
  if (cacheBustingParam) {
    url.searchParams.set('_rsc', cacheBustingParam)
  }
  return next.fetch(url.pathname + url.search, {
    headers: rsc
      ? { rsc: '1', 'next-router-state-tree': stateTree }
      : { 'next-router-state-tree': stateTree },
  })
}

describe('app dir - validation', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should reject an invalid router state tree with a 400', async () => {
    const stateTree1 = JSON.stringify(['', ''])
    const stateTree2 = JSON.stringify(['', {}])

    const headers1 = {
      rsc: '1',
      'next-router-state-tree': stateTree1,
    }

    const headers2 = {
      rsc: '1',
      'next-router-state-tree': stateTree2,
    }

    const url1 = new URL('/', 'http://localhost')
    const url2 = new URL('/', 'http://localhost')

    // Add cache busting search param for both requests
    const cacheBustingParam1 = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      stateTree1,
      undefined
    )
    const cacheBustingParam2 = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      stateTree2,
      undefined
    )

    if (cacheBustingParam1) {
      url1.searchParams.set('_rsc', cacheBustingParam1)
    }
    if (cacheBustingParam2) {
      url2.searchParams.set('_rsc', cacheBustingParam2)
    }

    const res = await next.fetch(url1.toString(), { headers: headers1 })
    expect(res.status).toBe(400)
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(await res.text()).toBe('Bad Request')

    const res2 = await next.fetch(url2.toString(), { headers: headers2 })
    expect(res2.status).toBe(200)
  })

  describe.each([
    { runtime: 'nodejs', prefixSegments: [] },
    { runtime: 'edge', prefixSegments: ['edge'] },
  ])('$runtime runtime', ({ prefixSegments }) => {
    const pathname = `/${[...prefixSegments, 'foo'].join('/')}`

    it('should reject a router state tree sent by an older Next.js version with a 400', async () => {
      const outputIndex = next.cliOutput.length

      const res = await fetchWithRouterState(
        next,
        pathname,
        createStateTree(prefixSegments, 'foo', { legacy: true })
      )
      expect(res.status).toBe(400)
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(await res.text()).toBe('Bad Request')

      // Invalid client input is not a server error.
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        'The router state header was sent but could not be parsed'
      )
    })

    it('should accept a valid router state tree', async () => {
      const res = await fetchWithRouterState(
        next,
        pathname,
        createStateTree(prefixSegments, 'foo', { legacy: false })
      )
      expect(res.status).toBe(200)
    })
  })

  it('should accept an RSC request without a router state tree', async () => {
    const res = await next.fetch('/foo', { headers: { rsc: '1' } })
    expect(res.status).toBe(200)
  })

  it('should ignore an invalid router state tree on a document request', async () => {
    const res = await fetchWithRouterState(
      next,
      '/foo',
      createStateTree([], 'foo', { legacy: true }),
      { rsc: false }
    )
    expect(res.status).toBe(200)
  })

  it('should only validate the router state tree when a static page renders it', async () => {
    const res = await fetchWithRouterState(next, '/static', '%5B')

    // Production servers strip Flight headers to serve the prebuilt static
    // response, so they never read the router state. Development renders it.
    expect(res.status).toBe(isNextDev ? 400 : 200)
  })

  it('should generate distinct cache-busting params for known colliding RSC variants', async () => {
    const stateTree = '%5B%22%22%2C%7B%7D%5D'

    const fullRequestHash = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      stateTree,
      undefined
    )
    const prefetchRequestHash = await computeCacheBustingSearchParam(
      '1',
      '/_tree',
      stateTree,
      '/pcsta0'
    )

    expect(fullRequestHash).toHaveLength(16)
    expect(prefetchRequestHash).toHaveLength(16)
    expect(fullRequestHash).not.toBe(prefetchRequestHash)
  })

  it('should accept legacy cache-busting params on plain HTTP requests', async () => {
    const stateTree = '%5B%22%22%2C%7B%7D%5D'
    const url = new URL('/', 'http://localhost')
    const headers = {
      rsc: '1',
      'next-router-state-tree': stateTree,
    }

    url.searchParams.set(
      '_rsc',
      computeLegacyCacheBustingSearchParam(
        undefined,
        undefined,
        stateTree,
        undefined
      )
    )

    const res = await next.fetch(url.toString(), {
      headers,
      redirect: 'manual',
    })

    expect(res.status).toBe(200)
  })
})

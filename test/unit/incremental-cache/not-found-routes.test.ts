import {
  IncrementalCache,
  type PrerenderManifestSource,
} from 'next/dist/server/lib/incremental-cache'
import { IncrementalCacheKind } from 'next/dist/server/response-cache'
import { RouteKind } from 'next/dist/server/route-kind'

function createCache(prerenderManifest: PrerenderManifestSource) {
  return new IncrementalCache({
    dev: false,
    requestHeaders: {},
    previewProps: {
      previewModeId: 'id',
      previewModeSigningKey: 'key',
      previewModeEncryptionKey: 'key',
    },
    prerenderManifest,
  })
}

describe('IncrementalCache.get for a path in notFoundRoutes', () => {
  const pathname = '/gone/missing'
  const owner = { kind: RouteKind.PAGES, sourceRoute: '/gone/[slug]' }
  const sibling = { kind: RouteKind.PAGES, sourceRoute: '/gone/[...all]' }
  const context = {
    kind: IncrementalCacheKind.PAGES,
    isFallback: false,
  } as const

  // The prerender data of `pages/gone/[slug]`, whose `getStaticProps` returned
  // `notFound: true` for this path during the build.
  const manifest = {
    version: 4,
    routes: {
      [pathname]: {
        dataRoute: '/_next/data/build-id/gone/missing.json',
        srcRoute: owner.sourceRoute,
        initialRevalidateSeconds: false,
        initialExpireSeconds: undefined,
        prefetchDataRoute: undefined,
        renderingMode: undefined,
      },
    },
    dynamicRoutes: {},
    notFoundRoutes: [pathname],
  } as const
  const empty = {
    version: 4,
    routes: {},
    dynamicRoutes: {},
    notFoundRoutes: [],
  } as const

  // Nothing is stored for the path, as in a server that just started. The
  // entry without a value answers the request, so the page does not render.
  const notFoundEntry = {
    value: null,
    cacheControl: { revalidate: false },
    isFallback: false,
  }

  it('returns the not-found entry from one manifest', async () => {
    const cache = createCache(manifest)

    expect(
      await cache.get(pathname, { ...context, route: owner })
    ).toMatchObject(notFoundEntry)
    expect(await cache.get(pathname, { ...context, route: sibling })).toBeNull()
  })

  it('returns the not-found entry from the manifest that a lookup returns for the owner of the response', async () => {
    const cache = createCache((route) =>
      route.sourceRoute === owner.sourceRoute ? manifest : empty
    )

    expect(
      await cache.get(pathname, { ...context, route: owner })
    ).toMatchObject(notFoundEntry)
    expect(await cache.get(pathname, { ...context, route: sibling })).toBeNull()
  })
})

import {
  CacheHandler,
  IncrementalCache,
} from 'next/dist/server/lib/incremental-cache'
import { getRouteCacheKey } from 'next/dist/server/lib/route-cache-key'
import { RouteKind } from 'next/dist/server/route-kind'
import {
  CachedRouteKind,
  IncrementalCacheKind,
} from 'next/dist/server/response-cache'

function createCache() {
  const get = jest
    .fn<ReturnType<CacheHandler['get']>, Parameters<CacheHandler['get']>>()
    .mockResolvedValue(null)
  const set = jest
    .fn<ReturnType<CacheHandler['set']>, Parameters<CacheHandler['set']>>()
    .mockResolvedValue(undefined)
  const preview = {
    previewModeId: 'id',
    previewModeSigningKey: 'key',
    previewModeEncryptionKey: 'key',
  }
  const cache = new IncrementalCache({
    dev: false,
    requestHeaders: {},
    previewProps: preview,
    prerenderManifest: {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview,
    },
    CurCacheHandler: class extends CacheHandler {
      get = get
      set = set
    },
  })
  return { cache, get, set }
}

describe('IncrementalCache handler context', () => {
  describe.each([
    [RouteKind.PAGES, IncrementalCacheKind.PAGES, '/handler/[id]'],
    [
      RouteKind.APP_PAGE,
      IncrementalCacheKind.APP_PAGE,
      '/(group)/handler/[id]/page',
    ],
    [
      RouteKind.APP_ROUTE,
      IncrementalCacheKind.APP_ROUTE,
      '/handler/[id]/route',
    ],
  ] as const)('%s', (routeKind, kind, sourceRoute) => {
    const pathname = '/handler/post'
    const route = Object.freeze({ kind: routeKind, sourceRoute })
    const cacheKey = getRouteCacheKey(pathname, route)
    it('keeps ownership internal while preserving get options', async () => {
      const { cache, get } = createCache()
      const options = {
        kind,
        isFallback: true,
        isRoutePPREnabled: true,
      }
      const context = Object.freeze({ route, ...options })

      await cache.get(pathname, context)
      expect(get).toHaveBeenCalledWith(cacheKey, options)
      expect(context.route).toBe(route)
    })

    it('keeps ownership internal while preserving set options', async () => {
      const { cache, set } = createCache()
      const options = {
        cacheControl: { revalidate: 60, expire: 120 },
        isFallback: true,
        isRoutePPREnabled: true,
      }
      const context = Object.freeze({ route, ...options })

      await cache.set(pathname, null, context)
      expect(set).toHaveBeenCalledWith(cacheKey, null, options)
      expect(context.route).toBe(route)
    })

    it('remembers handler-provided lifetimes separately for each source route', async () => {
      const { cache, get } = createCache()
      const lifetimePath = '/handler/lifetime'
      const sibling = {
        kind: routeKind,
        sourceRoute: sourceRoute.replace('[id]', '[...slug]'),
      }
      const cached = { value: null, lastModified: Date.now() - 5000 }
      const longLifetime = { revalidate: 3600, expire: 7200 }
      const shortLifetime = { revalidate: 2, expire: 60 }
      const context = { kind, isFallback: false }

      get.mockResolvedValue({ ...cached, cacheControl: longLifetime })
      await cache.get(lifetimePath, { ...context, route })
      get.mockResolvedValue({ ...cached, cacheControl: shortLifetime })
      await cache.get(lifetimePath, { ...context, route: sibling })

      // A handler may omit the lifetime on later reads. Each source must
      // retain its own previously returned lifetime for the same pathname.
      get.mockResolvedValue(cached)
      const original = await cache.get(lifetimePath, { ...context, route })
      const other = await cache.get(lifetimePath, {
        ...context,
        route: sibling,
      })
      expect(original?.cacheControl).toEqual(longLifetime)
      expect(original?.isStale).toBeFalsy()
      expect(other?.cacheControl).toEqual(shortLifetime)
      expect(other?.isStale).toBe(true)
    })
  })

  it('preserves fetch keys and contexts', async () => {
    const { cache, get, set } = createCache()
    const getContext = Object.freeze({
      kind: IncrementalCacheKind.FETCH,
      fetchUrl: 'https://example.com/data',
      fetchIdx: 1,
      revalidate: 60,
      tags: ['data'],
      softTags: ['page'],
    })
    await cache.get('fetch-key', getContext)
    expect(get).toHaveBeenCalledWith('fetch-key', getContext)

    const value = {
      kind: CachedRouteKind.FETCH as const,
      data: {
        headers: {},
        body: 'response',
        status: 200,
        url: getContext.fetchUrl,
      },
      revalidate: 60,
    }
    const setContext = Object.freeze({
      fetchCache: true,
      fetchUrl: getContext.fetchUrl,
      fetchIdx: 1,
      tags: ['data'],
    })
    await cache.set('fetch-key', value, setContext)
    expect(set).toHaveBeenCalledWith('fetch-key', value, setContext)
  })
})

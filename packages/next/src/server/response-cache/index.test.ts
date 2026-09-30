import ResponseCache from './index'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type ResponseCacheEntry,
} from './types'
import { RouteKind } from '../route-kind'
import RenderResult from '../render-result'
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants'
import { fromResponseCacheEntry } from './utils'

function mockIncrementalCache() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }
}

function makeCacheEntry(html: string): ResponseCacheEntry {
  return {
    value: {
      kind: CachedRouteKind.APP_PAGE,
      html: RenderResult.fromStatic(html, HTML_CONTENT_TYPE_HEADER),
      rscData: Buffer.from('rsc-payload'),
      postponed: undefined,
      status: 200,
      headers: undefined,
      segmentData: undefined,
    },
    cacheControl: { revalidate: 60, expire: undefined },
  }
}

describe('ResponseCache', () => {
  const route = { kind: RouteKind.APP_PAGE, sourceRoute: '/test/page' }

  it('rejects missing ownership even in minimal mode', () => {
    expect(() => {
      // @ts-expect-error response caches must explicitly select their owner
      new ResponseCache({ minimalMode: true })
    }).toThrow('Response cache requires a source route')
  })

  it('passes the source route to both reads and regeneration writes', async () => {
    const cache = new ResponseCache({ minimalMode: false, route })
    const incrementalCache = mockIncrementalCache()
    await cache.get('/test', async () => makeCacheEntry('generated'), {
      routeKind: RouteKind.APP_PAGE,
      incrementalCache,
    })
    expect(incrementalCache.get).toHaveBeenCalledWith('/test', {
      kind: IncrementalCacheKind.APP_PAGE,
      route,
      isFallback: false,
      isRoutePPREnabled: false,
    })
    expect(incrementalCache.set).toHaveBeenCalledWith(
      '/test',
      expect.any(Object),
      expect.objectContaining({ route })
    )
  })

  it('uses an explicit image context without a source route', async () => {
    const cache = new ResponseCache({ minimalMode: false, route: 'image' })
    const incrementalCache = mockIncrementalCache()
    await cache.get(
      'image-key',
      async () => ({
        value: {
          kind: CachedRouteKind.IMAGE,
          buffer: Buffer.from('image'),
          etag: 'etag',
          upstreamEtag: 'upstream-etag',
          extension: 'png',
        },
        cacheControl: { revalidate: 60, expire: undefined },
      }),
      {
        routeKind: RouteKind.IMAGE,
        incrementalCache,
      }
    )
    expect(incrementalCache.get).toHaveBeenCalledWith('image-key', {
      kind: IncrementalCacheKind.IMAGE,
      isFallback: false,
    })
    expect(incrementalCache.set).toHaveBeenCalledWith(
      'image-key',
      expect.objectContaining({ kind: CachedRouteKind.IMAGE }),
      {
        kind: IncrementalCacheKind.IMAGE,
        isFallback: false,
        cacheControl: { revalidate: 60, expire: undefined },
      }
    )
  })

  it('keeps ownership when extending a previous entry after regeneration fails', async () => {
    const cache = new ResponseCache({ minimalMode: false, route })
    const incrementalCache = mockIncrementalCache()
    const previous = await fromResponseCacheEntry(makeCacheEntry('cached'))
    incrementalCache.get.mockResolvedValue(previous)
    await expect(
      cache.get(
        '/test',
        async () => {
          throw new Error('regeneration failed')
        },
        {
          routeKind: RouteKind.APP_PAGE,
          incrementalCache,
          isOnDemandRevalidate: true,
        }
      )
    ).rejects.toThrow('regeneration failed')
    expect(incrementalCache.set).toHaveBeenCalledWith(
      '/test',
      previous.value,
      expect.objectContaining({
        route,
        cacheControl: { revalidate: 30, expire: undefined },
      })
    )
  })

  describe('minimal mode LRU population for batched invocations', () => {
    it('should populate LRU for all batched invocationIDs, not just the winner', async () => {
      const cache = new ResponseCache({ minimalMode: true, route })
      const incrementalCache = mockIncrementalCache()

      let renderCount = 0
      let resolveRender: () => void
      const renderStarted = new Promise<void>((r) => {
        resolveRender = r
      })

      const responseGenerator = jest.fn(async () => {
        renderCount++
        if (renderCount === 1) {
          resolveRender()
          await new Promise((r) => setTimeout(r, 50))
        }
        return makeCacheEntry(`render-${renderCount}`)
      })

      const promiseA = cache.get('/test', responseGenerator, {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        invocationID: 'invocation-a',
      })

      await renderStarted

      const promiseB = cache.get('/test', responseGenerator, {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        invocationID: 'invocation-b',
      })

      const [resultA, resultB] = await Promise.all([promiseA, promiseB])

      expect(renderCount).toBe(1)
      expect(resultA).not.toBeNull()
      expect(resultB).not.toBeNull()

      // Follow-up request for invocation-b should hit the LRU
      const followUpB = await cache.get('/test', responseGenerator, {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        invocationID: 'invocation-b',
      })

      expect(renderCount).toBe(1)
      expect(followUpB).not.toBeNull()
    })

    it('should use TTL-based LRU when invocationID is absent', async () => {
      const cache = new ResponseCache({ minimalMode: true, route })
      const incrementalCache = mockIncrementalCache()

      let renderCount = 0
      const responseGenerator = jest.fn(async () => {
        renderCount++
        return makeCacheEntry(`render-${renderCount}`)
      })

      await cache.get('/test', responseGenerator, {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
      })

      const followUp = await cache.get('/test', responseGenerator, {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
      })

      expect(renderCount).toBe(1)
      expect(followUp).not.toBeNull()
    })
  })
})

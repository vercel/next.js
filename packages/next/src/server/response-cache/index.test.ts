import ResponseCache from './index'
import { CachedRouteKind, type ResponseCacheEntry } from './types'
import { RouteKind } from '../route-kind'
import RenderResult from '../render-result'
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants'

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
  describe('minimal mode LRU population for batched invocations', () => {
    it('should populate LRU for all batched invocationIDs, not just the winner', async () => {
      const cache = new ResponseCache(true)
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
      const cache = new ResponseCache(true)
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

  describe('background revalidation timeout', () => {
    function makeStaleEntry() {
      return {
        ...makeCacheEntry('stale'),
        isStale: true,
      }
    }

    it('should abandon a background revalidation that never settles', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      try {
        const cache = new ResponseCache(false)
        const incrementalCache = {
          get: jest.fn().mockResolvedValue(makeStaleEntry()),
          set: jest.fn().mockResolvedValue(undefined),
        }

        // A generator that never settles, e.g. a fetch to a host that accepts
        // the connection and then goes silent.
        const responseGenerator = jest.fn(() => new Promise<never>(() => {}))

        const first = await cache.get('/hangs', responseGenerator, {
          routeKind: RouteKind.PAGES,
          incrementalCache,
          revalidationTimeout: 50,
        })

        // The stale entry is still served right away.
        expect(first).not.toBeNull()

        // Once the timeout passes, the failed revalidation re-sets the cached
        // entry with a short revalidate so the next request retries.
        await new Promise((resolve) => setTimeout(resolve, 150))
        expect(responseGenerator).toHaveBeenCalledTimes(1)
        expect(incrementalCache.set).toHaveBeenCalledTimes(1)
        expect(
          incrementalCache.set.mock.calls[0][2].cacheControl.revalidate
        ).toBeLessThanOrEqual(30)

        // A later request is not stuck behind the abandoned revalidation.
        const second = await cache.get('/hangs', responseGenerator, {
          routeKind: RouteKind.PAGES,
          incrementalCache,
          revalidationTimeout: 50,
        })

        expect(second).not.toBeNull()

        // The revalidation is scheduled on the next tick, so let it start.
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(responseGenerator).toHaveBeenCalledTimes(2)
      } finally {
        consoleError.mockRestore()
      }
    })

    it('should not time out a revalidation that finishes in time', async () => {
      const cache = new ResponseCache(false)
      const incrementalCache = {
        get: jest.fn().mockResolvedValue(makeStaleEntry()),
        set: jest.fn().mockResolvedValue(undefined),
      }

      const responseGenerator = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return makeCacheEntry('fresh')
      })

      await cache.get('/fast', responseGenerator, {
        routeKind: RouteKind.PAGES,
        incrementalCache,
        revalidationTimeout: 500,
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(incrementalCache.set).toHaveBeenCalledTimes(1)
      expect(
        incrementalCache.set.mock.calls[0][2].cacheControl.revalidate
      ).toBe(60)
    })
  })
})

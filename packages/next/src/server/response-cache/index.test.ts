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
})

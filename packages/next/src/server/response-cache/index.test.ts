import ResponseCache from './index'
import { CachedRouteKind, type ResponseCacheEntry } from './types'
import { RouteKind } from '../route-kind'
import RenderResult, { type PrerenderFailure } from '../render-result'
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

    it('shares an in-flight failure across invocations but retries for a later invocation', async () => {
      const cache = new ResponseCache(true)
      const incrementalCache = mockIncrementalCache()
      const context = { routeKind: RouteKind.APP_PAGE, incrementalCache }

      let startRender: () => void
      const renderStarted = new Promise<void>((resolve) => {
        startRender = resolve
      })
      let finishRender!: () => void
      const renderPending = new Promise<void>((resolve) => {
        finishRender = resolve
      })

      const failure: PrerenderFailure = {
        error: new Error('Invocation A failed'),
        result: RenderResult.fromStatic(
          '<p>Error boundary</p>',
          HTML_CONTENT_TYPE_HEADER
        ),
      }
      const successfulEntry = makeCacheEntry('<p>Invocation C succeeded</p>')
      const failedGenerator = jest.fn(async () => {
        startRender()
        await renderPending
        return failure
      })
      const successfulGenerator = jest.fn(async () => successfulEntry)

      const invocationA = cache.get('/test', failedGenerator, {
        ...context,
        invocationID: 'invocation-a',
      })
      await renderStarted

      const invocationB = cache.get('/test', successfulGenerator, {
        ...context,
        invocationID: 'invocation-b',
      })
      finishRender()

      const [resultA, resultB] = await Promise.all([invocationA, invocationB])
      expect(resultA).toBe(failure)
      expect(resultB).toBe(failure)
      expect(successfulGenerator).not.toHaveBeenCalled()

      for (const invocationID of ['invocation-a', 'invocation-b']) {
        const followUp = await cache.get('/test', successfulGenerator, {
          ...context,
          invocationID,
        })
        expect(followUp).toBe(failure)
      }
      expect(successfulGenerator).not.toHaveBeenCalled()

      const resultC = await cache.get('/test', successfulGenerator, {
        ...context,
        invocationID: 'invocation-c',
      })
      expect(resultC).toMatchObject(successfulEntry)
      expect(failedGenerator).toHaveBeenCalledTimes(1)
      expect(successfulGenerator).toHaveBeenCalledTimes(1)
      expect(incrementalCache.set).not.toHaveBeenCalled()
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

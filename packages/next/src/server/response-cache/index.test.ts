import ResponseCache from './index'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type ResponseCacheEntry,
  type ResponseCacheResult,
} from './types'
import { RouteKind } from '../route-kind'
import RenderResult, { type PrerenderFailure } from '../render-result'
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

function mockStaleIncrementalCache() {
  const incrementalCache = mockIncrementalCache()
  incrementalCache.get.mockResolvedValue({
    value: {
      kind: CachedRouteKind.APP_PAGE,
      html: 'stale',
      rscData: Buffer.from('rsc-payload'),
      postponed: undefined,
      status: 200,
      headers: undefined,
      segmentData: undefined,
    },
    isStale: true,
    cacheControl: { revalidate: 60, expire: undefined },
  })
  return incrementalCache
}

function createBlockedGenerator(getEntry: () => ResponseCacheEntry) {
  let start!: () => void
  const started = new Promise<void>((resolve) => {
    start = resolve
  })
  let finish!: () => void
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })
  const generator = jest.fn(async () => {
    start()
    await finished
    return getEntry()
  })
  return { generator, started, finish }
}

function getHtml(result: ResponseCacheResult) {
  return result !== null &&
    'value' in result &&
    result.value?.kind === CachedRouteKind.APP_PAGE
    ? result.value.html.toUnchunkedString()
    : undefined
}

// `revalidate` returns the entry in the form that's persisted.
function getRevalidatedHtml(
  result: Awaited<ReturnType<ResponseCache['revalidate']>>
) {
  return result !== null &&
    'value' in result &&
    result.value?.kind === CachedRouteKind.APP_PAGE
    ? result.value.html
    : undefined
}

function getPersistedHtml(
  incrementalCache: ReturnType<typeof mockIncrementalCache>
) {
  return incrementalCache.set.mock.calls.map(([, value]) => value.html)
}

// Lets pending requests run until each one is blocked on a render.
function flushScheduledWork() {
  return new Promise<void>((resolve) => setImmediate(resolve))
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

  it.each(['throw', 'return'])(
    'keeps ownership when extending a previous entry after a %s failure',
    async (failureMode) => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockIncrementalCache()
      const previous = await fromResponseCacheEntry(makeCacheEntry('cached'))
      incrementalCache.get.mockResolvedValue(previous)
      const failure: PrerenderFailure = {
        error: new Error('regeneration failed'),
        result: RenderResult.fromStatic(
          'error boundary',
          HTML_CONTENT_TYPE_HEADER
        ),
      }
      const result = cache.get(
        '/test',
        async () => {
          if (failureMode === 'throw') {
            throw failure.error
          }
          return failure
        },
        {
          routeKind: RouteKind.APP_PAGE,
          incrementalCache,
          isOnDemandRevalidate: true,
        }
      )
      if (failureMode === 'throw') {
        await expect(result).rejects.toThrow('regeneration failed')
      } else {
        await expect(result).resolves.toBe(failure)
      }
      expect(incrementalCache.set).toHaveBeenCalledWith(
        '/test',
        previous.value,
        expect.objectContaining({
          route,
          cacheControl: { revalidate: 30, expire: undefined },
        })
      )
    }
  )

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

    it('shares an in-flight failure across invocations but retries for a later invocation', async () => {
      const cache = new ResponseCache({ minimalMode: true, route })
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

  describe('on-demand revalidation', () => {
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('does not join a revalidation that started before it', async () => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const waitUntil = jest.fn()
      const context = {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        waitUntil,
      }
      const background = createBlockedGenerator(() =>
        makeCacheEntry('background')
      )
      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))

      const staleResult = await cache.get(
        '/test',
        background.generator,
        context
      )
      expect(getHtml(staleResult)).toBe('stale')
      await background.started

      const onDemandResult = cache.get('/test', onDemandGenerator, {
        ...context,
        isOnDemandRevalidate: true,
      })
      await flushScheduledWork()
      background.finish()

      expect(getHtml(await onDemandResult)).toBe('on-demand')
      await Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

      expect(background.generator).toHaveBeenCalledTimes(1)
      expect(onDemandGenerator).toHaveBeenCalledTimes(1)
      // The earlier revalidation finished last, but its result may be older.
      expect(getPersistedHtml(incrementalCache)).toEqual(['on-demand'])
    })

    it('is joined by revalidations that start after it', async () => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const waitUntil = jest.fn()
      const context = {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        waitUntil,
      }
      const onDemand = createBlockedGenerator(() => makeCacheEntry('on-demand'))
      const backgroundGenerator = jest.fn(async () =>
        makeCacheEntry('background')
      )

      const onDemandResult = cache.get('/test', onDemand.generator, {
        ...context,
        isOnDemandRevalidate: true,
      })
      await onDemand.started

      const staleResult = await cache.get('/test', backgroundGenerator, context)
      expect(getHtml(staleResult)).toBe('stale')
      await flushScheduledWork()
      onDemand.finish()

      expect(getHtml(await onDemandResult)).toBe('on-demand')
      await Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

      expect(backgroundGenerator).not.toHaveBeenCalled()
      expect(getPersistedHtml(incrementalCache)).toEqual(['on-demand'])
    })

    it('does not join a revalidation that started before it in minimal mode', async () => {
      const cache = new ResponseCache({ minimalMode: true, route })
      const incrementalCache = mockIncrementalCache()
      const context = { routeKind: RouteKind.APP_PAGE, incrementalCache }
      const background = createBlockedGenerator(() =>
        makeCacheEntry('background')
      )
      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))

      const blockingResult = cache.get('/test', background.generator, {
        ...context,
        invocationID: 'invocation-a',
      })
      await background.started

      const onDemandResult = cache.get('/test', onDemandGenerator, {
        ...context,
        isOnDemandRevalidate: true,
        invocationID: 'invocation-b',
      })
      await flushScheduledWork()
      background.finish()

      expect(getHtml(await blockingResult)).toBe('background')
      expect(getHtml(await onDemandResult)).toBe('on-demand')
      expect(onDemandGenerator).toHaveBeenCalledTimes(1)
      expect(incrementalCache.set).not.toHaveBeenCalled()
    })

    it('does not restore the previous entry when a superseded revalidation fails', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const waitUntil = jest.fn()
      const context = {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        waitUntil,
      }
      const background = createBlockedGenerator(() => {
        throw new Error('Background render failed')
      })
      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))

      await cache.get('/test', background.generator, context)
      await background.started

      const onDemandResult = cache.get('/test', onDemandGenerator, {
        ...context,
        isOnDemandRevalidate: true,
      })
      await flushScheduledWork()
      background.finish()

      expect(getHtml(await onDemandResult)).toBe('on-demand')
      await Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

      // Restoring the stale entry would overwrite the on-demand result.
      expect(getPersistedHtml(incrementalCache)).toEqual(['on-demand'])
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Background render failed' })
      )
    })

    it('does not let a later revalidation join a superseded one', async () => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const background = createBlockedGenerator(() =>
        makeCacheEntry('background')
      )

      const backgroundResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        background.generator,
        null,
        false
      )
      await background.started

      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))
      const onDemandResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        onDemandGenerator,
        null,
        false,
        undefined,
        true
      )
      await flushScheduledWork()
      expect(onDemandGenerator).toHaveBeenCalledTimes(1)
      expect(getRevalidatedHtml(await onDemandResult)).toBe('on-demand')

      // The superseded revalidation is still running, but a revalidation that
      // starts now renders again instead of joining it.
      const laterGenerator = jest.fn(async () => makeCacheEntry('later'))
      const waitUntil = jest.fn()
      const laterResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        laterGenerator,
        null,
        false,
        waitUntil
      )
      await flushScheduledWork()
      expect(laterGenerator).toHaveBeenCalledTimes(1)
      expect(waitUntil).toHaveBeenCalledTimes(1)
      expect(getRevalidatedHtml(await laterResult)).toBe('later')

      background.finish()
      expect(getRevalidatedHtml(await backgroundResult)).toBe('background')
      expect(getPersistedHtml(incrementalCache)).toEqual(['on-demand', 'later'])
    })

    it('shares one render between concurrent on-demand revalidations', async () => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const first = createBlockedGenerator(() => makeCacheEntry('first'))
      const secondGenerator = jest.fn(async () => makeCacheEntry('second'))

      const firstResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        first.generator,
        null,
        false,
        undefined,
        true
      )
      await first.started
      const secondResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        secondGenerator,
        null,
        false,
        undefined,
        true
      )
      first.finish()

      expect(await secondResult).toBe(await firstResult)
      expect(secondGenerator).not.toHaveBeenCalled()
      expect(getPersistedHtml(incrementalCache)).toEqual(['first'])
    })

    it('keeps an on-demand revalidation in flight when the one it superseded finishes first', async () => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const background = createBlockedGenerator(() =>
        makeCacheEntry('background')
      )
      const onDemand = createBlockedGenerator(() => makeCacheEntry('on-demand'))
      const laterGenerator = jest.fn(async () => makeCacheEntry('later'))

      const backgroundResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        background.generator,
        null,
        false
      )
      await background.started
      const onDemandResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        onDemand.generator,
        null,
        false,
        undefined,
        true
      )
      await flushScheduledWork()
      expect(onDemand.generator).toHaveBeenCalledTimes(1)
      await onDemand.started

      // The superseded revalidation finishes while the on-demand one is still
      // rendering, which must stay the one that later revalidations join.
      background.finish()
      expect(getRevalidatedHtml(await backgroundResult)).toBe('background')

      const laterResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        laterGenerator,
        null,
        false
      )
      onDemand.finish()

      expect(getRevalidatedHtml(await onDemandResult)).toBe('on-demand')
      expect(await laterResult).toBe(await onDemandResult)
      expect(laterGenerator).not.toHaveBeenCalled()
      expect(getPersistedHtml(incrementalCache)).toEqual(['on-demand'])
    })

    it('does not restore the previous entry when a superseded revalidation returns a failure', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {})
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const waitUntil = jest.fn()
      const context = {
        routeKind: RouteKind.APP_PAGE,
        incrementalCache,
        waitUntil,
      }
      let finishBackground!: () => void
      const backgroundFinished = new Promise<void>((resolve) => {
        finishBackground = resolve
      })
      let backgroundStarted!: () => void
      const backgroundStart = new Promise<void>((resolve) => {
        backgroundStarted = resolve
      })
      const failure: PrerenderFailure = {
        error: new Error('Background render failed'),
        result: RenderResult.fromStatic(
          '<p>Error boundary</p>',
          HTML_CONTENT_TYPE_HEADER
        ),
      }
      const backgroundGenerator = jest.fn(async () => {
        backgroundStarted()
        await backgroundFinished
        return failure
      })
      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))

      await cache.get('/test', backgroundGenerator, context)
      await backgroundStart

      const onDemandResult = cache.get('/test', onDemandGenerator, {
        ...context,
        isOnDemandRevalidate: true,
      })
      await flushScheduledWork()
      finishBackground()

      expect(getHtml(await onDemandResult)).toBe('on-demand')
      await Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

      // Restoring the stale entry would overwrite the on-demand result.
      expect(getPersistedHtml(incrementalCache)).toEqual(['on-demand'])
    })

    describe('incremental cache writes', () => {
      // Records the start and end of each write. A write of `blockedHtml`
      // stays in flight until `finishBlockedWrite` is called.
      function recordWrites(
        incrementalCache: ReturnType<typeof mockIncrementalCache>,
        blockedHtml: string
      ) {
        const writes: string[] = []
        let finishBlockedWrite!: () => void
        const blockedWriteFinished = new Promise<void>((resolve) => {
          finishBlockedWrite = resolve
        })
        incrementalCache.set.mockImplementation(async (_key, value) => {
          writes.push(`start:${value.html}`)
          if (value.html === blockedHtml) await blockedWriteFinished
          writes.push(`finish:${value.html}`)
        })
        return { writes, finishBlockedWrite }
      }

      it('does not let a superseded write that already started finish last', async () => {
        const cache = new ResponseCache({ minimalMode: false, route })
        const incrementalCache = mockStaleIncrementalCache()
        const { writes, finishBlockedWrite } = recordWrites(
          incrementalCache,
          'background'
        )
        const waitUntil = jest.fn()
        const context = {
          routeKind: RouteKind.APP_PAGE,
          incrementalCache,
          waitUntil,
        }
        const onDemandGenerator = jest.fn(async () =>
          makeCacheEntry('on-demand')
        )

        await cache.get(
          '/test',
          async () => makeCacheEntry('background'),
          context
        )
        await flushScheduledWork()
        expect(writes).toEqual(['start:background'])

        const onDemandResult = cache.get('/test', onDemandGenerator, {
          ...context,
          isOnDemandRevalidate: true,
        })
        await flushScheduledWork()
        expect(onDemandGenerator).toHaveBeenCalledTimes(1)
        // The on-demand write waits for the earlier write instead of racing it.
        expect(writes).toEqual(['start:background'])

        finishBlockedWrite()
        expect(getHtml(await onDemandResult)).toBe('on-demand')
        await Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

        expect(writes).toEqual([
          'start:background',
          'finish:background',
          'start:on-demand',
          'finish:on-demand',
        ])
      })

      it('does not let a superseded write of the previous entry that already started finish last', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {})
        const cache = new ResponseCache({ minimalMode: false, route })
        const incrementalCache = mockStaleIncrementalCache()
        const { writes, finishBlockedWrite } = recordWrites(
          incrementalCache,
          'stale'
        )
        const waitUntil = jest.fn()
        const context = {
          routeKind: RouteKind.APP_PAGE,
          incrementalCache,
          waitUntil,
        }

        await cache.get(
          '/test',
          async () => {
            throw new Error('Background render failed')
          },
          context
        )
        await flushScheduledWork()
        // The failed revalidation retains the previous entry.
        expect(writes).toEqual(['start:stale'])

        const onDemandResult = cache.get(
          '/test',
          async () => makeCacheEntry('on-demand'),
          { ...context, isOnDemandRevalidate: true }
        )
        await flushScheduledWork()
        expect(writes).toEqual(['start:stale'])

        finishBlockedWrite()
        expect(getHtml(await onDemandResult)).toBe('on-demand')
        await Promise.all(waitUntil.mock.calls.map(([promise]) => promise))

        expect(writes).toEqual([
          'start:stale',
          'finish:stale',
          'start:on-demand',
          'finish:on-demand',
        ])
      })

      it('skips a write that was superseded while it waited for an earlier write', async () => {
        const cache = new ResponseCache({ minimalMode: false, route })
        const incrementalCache = mockIncrementalCache()
        const { writes, finishBlockedWrite } = recordWrites(
          incrementalCache,
          'prefetch'
        )

        // A prefetch that misses renders without joining a revalidation, so
        // its write is in flight independently of them.
        const prefetchResult = cache.get(
          '/test',
          async () => makeCacheEntry('prefetch'),
          {
            routeKind: RouteKind.APP_PAGE,
            incrementalCache,
            isPrefetch: true,
          }
        )
        await flushScheduledWork()
        expect(writes).toEqual(['start:prefetch'])

        const backgroundResult = cache.revalidate(
          '/test',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('background'),
          null,
          false
        )
        await flushScheduledWork()
        const onDemandResult = cache.revalidate(
          '/test',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('on-demand'),
          null,
          false,
          undefined,
          true
        )
        await flushScheduledWork()
        expect(writes).toEqual(['start:prefetch'])

        finishBlockedWrite()
        expect(getHtml(await prefetchResult)).toBe('prefetch')
        expect(getRevalidatedHtml(await backgroundResult)).toBe('background')
        expect(getRevalidatedHtml(await onDemandResult)).toBe('on-demand')

        expect(writes).toEqual([
          'start:prefetch',
          'finish:prefetch',
          'start:on-demand',
          'finish:on-demand',
        ])
      })

      it('makes later writes wait for a write that itself waited for an earlier one', async () => {
        const cache = new ResponseCache({ minimalMode: false, route })
        const incrementalCache = mockIncrementalCache()
        // Every write stays in flight until it's finished by its html.
        const writes: string[] = []
        const finishWrite = new Map<string, () => void>()
        incrementalCache.set.mockImplementation(async (_key, value) => {
          writes.push(`start:${value.html}`)
          await new Promise<void>((resolve) => {
            finishWrite.set(value.html, resolve)
          })
          writes.push(`finish:${value.html}`)
        })

        const prefetchResult = cache.get(
          '/test',
          async () => makeCacheEntry('prefetch'),
          {
            routeKind: RouteKind.APP_PAGE,
            incrementalCache,
            isPrefetch: true,
          }
        )
        await flushScheduledWork()
        const backgroundResult = cache.revalidate(
          '/test',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('background'),
          null,
          false
        )
        await flushScheduledWork()
        expect(writes).toEqual(['start:prefetch'])

        // The background write starts once the prefetch write finishes.
        finishWrite.get('prefetch')!()
        expect(getHtml(await prefetchResult)).toBe('prefetch')
        await flushScheduledWork()
        expect(writes).toEqual([
          'start:prefetch',
          'finish:prefetch',
          'start:background',
        ])

        // The on-demand write waits for the background write, which is still
        // in flight although the write it waited for has finished.
        const onDemandResult = cache.revalidate(
          '/test',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('on-demand'),
          null,
          false,
          undefined,
          true
        )
        await flushScheduledWork()
        expect(writes).toEqual([
          'start:prefetch',
          'finish:prefetch',
          'start:background',
        ])

        finishWrite.get('background')!()
        expect(getRevalidatedHtml(await backgroundResult)).toBe('background')
        await flushScheduledWork()
        finishWrite.get('on-demand')!()
        expect(getRevalidatedHtml(await onDemandResult)).toBe('on-demand')

        expect(writes).toEqual([
          'start:prefetch',
          'finish:prefetch',
          'start:background',
          'finish:background',
          'start:on-demand',
          'finish:on-demand',
        ])
      })

      it('writes after an earlier write for the key fails', async () => {
        const cache = new ResponseCache({ minimalMode: false, route })
        const incrementalCache = mockIncrementalCache()
        let failBlockedWrite!: (err: Error) => void
        incrementalCache.set.mockImplementationOnce(
          () =>
            new Promise<void>((_resolve, reject) => {
              failBlockedWrite = reject
            })
        )

        const backgroundResult = cache.revalidate(
          '/test',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('background'),
          null,
          false
        )
        await flushScheduledWork()
        const onDemandResult = cache.revalidate(
          '/test',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('on-demand'),
          null,
          false,
          undefined,
          true
        )
        await flushScheduledWork()
        expect(incrementalCache.set).toHaveBeenCalledTimes(1)

        failBlockedWrite(new Error('Write failed'))
        await expect(backgroundResult).rejects.toThrow('Write failed')
        expect(getRevalidatedHtml(await onDemandResult)).toBe('on-demand')
        expect(getPersistedHtml(incrementalCache)).toEqual([
          'background',
          'on-demand',
        ])
      })

      it('does not delay writes for other keys', async () => {
        const cache = new ResponseCache({ minimalMode: false, route })
        const incrementalCache = mockIncrementalCache()
        const { writes, finishBlockedWrite } = recordWrites(
          incrementalCache,
          'a'
        )

        const resultA = cache.revalidate(
          '/a',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('a'),
          null,
          false
        )
        await flushScheduledWork()
        const resultB = cache.revalidate(
          '/b',
          incrementalCache,
          false,
          false,
          async () => makeCacheEntry('b'),
          null,
          false,
          undefined,
          true
        )
        expect(getRevalidatedHtml(await resultB)).toBe('b')
        expect(writes).toEqual(['start:a', 'start:b', 'finish:b'])

        finishBlockedWrite()
        expect(getRevalidatedHtml(await resultA)).toBe('a')
      })
    })

    it('does not store a superseded result for requests without an invocation ID in minimal mode', async () => {
      const cache = new ResponseCache({ minimalMode: true, route })
      const incrementalCache = mockIncrementalCache()
      const context = { routeKind: RouteKind.APP_PAGE, incrementalCache }
      const background = createBlockedGenerator(() =>
        makeCacheEntry('background')
      )
      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))
      const laterGenerator = jest.fn(async () => makeCacheEntry('later'))

      const backgroundResult = cache.get('/test', background.generator, context)
      await background.started

      const onDemandResult = cache.get('/test', onDemandGenerator, {
        ...context,
        isOnDemandRevalidate: true,
      })
      await flushScheduledWork()
      expect(onDemandGenerator).toHaveBeenCalledTimes(1)
      expect(getHtml(await onDemandResult)).toBe('on-demand')

      // The superseded render finishes last. Its callers still get its result.
      background.finish()
      expect(getHtml(await backgroundResult)).toBe('background')

      // A later request without an invocation ID reuses the on-demand result.
      expect(getHtml(await cache.get('/test', laterGenerator, context))).toBe(
        'on-demand'
      )
      expect(laterGenerator).not.toHaveBeenCalled()
    })

    it('stores a superseded result for its own invocation in minimal mode', async () => {
      const cache = new ResponseCache({ minimalMode: true, route })
      const incrementalCache = mockIncrementalCache()
      const context = { routeKind: RouteKind.APP_PAGE, incrementalCache }
      const background = createBlockedGenerator(() =>
        makeCacheEntry('background')
      )
      const onDemandGenerator = jest.fn(async () => makeCacheEntry('on-demand'))
      const laterGenerator = jest.fn(async () => makeCacheEntry('later'))

      const backgroundResult = cache.get('/test', background.generator, {
        ...context,
        invocationID: 'invocation-a',
      })
      await background.started

      const onDemandResult = cache.get('/test', onDemandGenerator, {
        ...context,
        isOnDemandRevalidate: true,
        invocationID: 'invocation-b',
      })
      await flushScheduledWork()
      expect(onDemandGenerator).toHaveBeenCalledTimes(1)
      expect(getHtml(await onDemandResult)).toBe('on-demand')

      background.finish()
      expect(getHtml(await backgroundResult)).toBe('background')

      // Related requests of the invocation that got the superseded result
      // still reuse it, so that invocation stays consistent.
      expect(
        getHtml(
          await cache.get('/test', laterGenerator, {
            ...context,
            invocationID: 'invocation-a',
          })
        )
      ).toBe('background')
      expect(laterGenerator).not.toHaveBeenCalled()
    })
  })

  describe('revalidate', () => {
    it('shares one render between concurrent revalidations', async () => {
      const cache = new ResponseCache({ minimalMode: false, route })
      const incrementalCache = mockStaleIncrementalCache()
      const first = createBlockedGenerator(() => makeCacheEntry('first'))
      const secondGenerator = jest.fn(async () => makeCacheEntry('second'))

      const firstResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        first.generator,
        null,
        false
      )
      await first.started
      const secondResult = cache.revalidate(
        '/test',
        incrementalCache,
        false,
        false,
        secondGenerator,
        null,
        false
      )
      first.finish()

      expect(await secondResult).toBe(await firstResult)
      expect(secondGenerator).not.toHaveBeenCalled()
    })
  })
})

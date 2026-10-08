import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from './incremental-cache'
import { CachedRouteKind } from '../response-cache'
import { createPatchedFetcher } from './patch-fetch'
import { registerLocalSpanRecorder } from './trace/local-span-recorder'
import {
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './trace/span-store'

const originalDevServer = process.env.__NEXT_DEV_SERVER
const spanRecords: SpanStoreRecord[] = []

describe('createPatchedFetcher', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    registerLocalSpanRecorder()
  })

  afterEach(() => {
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    setSpanRecorderForTest(undefined)
    spanRecords.length = 0
  })

  it('should not buffer a streamed response', async () => {
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
    let streamChunk: () => void

    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('stream start'))
        streamChunk = () => {
          controller.enqueue(new TextEncoder().encode('stream end'))
          controller.close()
        }
      },
    })

    mockFetch.mockResolvedValue(new Response(readableStream))

    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()

    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()

    const patchedFetch = createPatchedFetcher(mockFetch, {
      // workUnitAsyncStorage does not need to provide a store for this test.
      workAsyncStorage,
      workUnitAsyncStorage,
    })

    let resolveIncrementalCacheSet: () => void

    const incrementalCacheSetPromise = new Promise<void>((resolve) => {
      resolveIncrementalCacheSet = resolve
    })

    const incrementalCache = {
      get: jest.fn(),
      set: jest.fn(() => resolveIncrementalCacheSet()),
      generateCacheKey: jest.fn(() => 'test-cache-key'),
      lock: jest.fn(() => () => {}),
    } as unknown as IncrementalCache

    // We only need to provide a few of the WorkStore properties.
    const workStore: Partial<WorkStore> = {
      page: '/',
      route: '/',
      incrementalCache,
    }

    await workAsyncStorage.run(workStore as WorkStore, async () => {
      const response = await patchedFetch('https://example.com', {
        cache: 'force-cache',
      })

      if (!response.body) {
        throw new Error(`Response body is ${JSON.stringify(response.body)}.`)
      }

      const reader = response.body.getReader()
      let result = await reader.read()
      const textDecoder = new TextDecoder()
      expect(textDecoder.decode(result.value)).toBe('stream start')
      streamChunk()
      result = await reader.read()
      expect(textDecoder.decode(result.value)).toBe('stream end')

      await incrementalCacheSetPromise

      expect(incrementalCache.set).toHaveBeenCalledWith(
        'test-cache-key',
        {
          data: {
            body: btoa('stream startstream end'),
            headers: {},
            status: 200,
            url: '', // the mocked response does not have a URL
          },
          kind: 'FETCH',
          revalidate: 31536000, // default of one year
        },
        {
          fetchCache: true,
          fetchIdx: 1,
          fetchUrl: 'https://example.com/',
          tags: [],
          isImplicitBuildTimeCache: false,
        }
      )
    })
    // Setting a lower timeout than default, because the test will fail with a
    // timeout when we regress and buffer the response.
  }, 1000)

  it('records fetch outcome attributes on local AppRender.fetch spans', async () => {
    setSpanRecorderForTest((span) => spanRecords.push(span))

    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
    mockFetch.mockResolvedValue(new Response('ok', { status: 201 }))

    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })

    const workStore: Partial<WorkStore> = {
      page: '/',
      route: '/',
      shouldTrackFetchMetrics: true,
    }

    await workAsyncStorage.run(workStore as WorkStore, async () => {
      await patchedFetch('https://example.com/api', {
        cache: 'no-store',
      })
    })

    expect(
      spanRecords.filter(
        (span) => span.name === 'fetch GET https://example.com/api'
      )
    ).toEqual([
      expect.objectContaining({
        name: 'fetch GET https://example.com/api',
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span_type': 'AppRender.fetch',
          'http.url': 'https://example.com/api',
          'http.method': 'GET',
          'http.status_code': 201,
          'next.fetch.idx': 2,
          'next.fetch.cache_status': 'skip',
          'next.fetch.cache_reason': 'cache: no-store',
        }),
      }),
    ])
  })

  it.each(
    [200, 201, 302, 399, 400, 404, 499, 500, 599, 600].flatMap((status) =>
      [false, true].map((shouldTrackFetchMetrics) => ({
        status,
        shouldTrackFetchMetrics,
      }))
    )
  )(
    'records HTTP $status with fetch metrics=$shouldTrackFetchMetrics',
    async ({ status, shouldTrackFetchMetrics }) => {
      setSpanRecorderForTest((span) => spanRecords.push(span))

      const originResponse = new Response('response body', {
        status: Math.min(status, 599),
        headers: { 'x-test-header': 'response header' },
      })
      if (status === 600) {
        Object.defineProperty(originResponse, 'status', { value: status })
      }
      const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
      mockFetch.mockResolvedValue(originResponse)
      const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
      const patchedFetch = createPatchedFetcher(mockFetch, {
        workAsyncStorage,
        workUnitAsyncStorage: new AsyncLocalStorage<WorkUnitStore>(),
      })
      const workStore: Partial<WorkStore> = {
        page: '/',
        route: '/',
        shouldTrackFetchMetrics,
      }

      const response = await workAsyncStorage.run(workStore as WorkStore, () =>
        patchedFetch('https://example.com/api', { cache: 'no-store' })
      )

      expect(response).toBe(originResponse)
      expect(response.status).toBe(status)
      expect(response.headers.get('x-test-header')).toBe('response header')
      expect(await response.text()).toBe('response body')

      expect(spanRecords).toHaveLength(1)
      const span = spanRecords[0]
      const isHttpError = status >= 400
      expect(span.status).toBe(isHttpError ? 'error' : 'ok')
      expect(span.attributes?.['http.status_code']).toBe(status)
      expect(span.attributes?.['error.type']).toBe(
        isHttpError ? String(status) : undefined
      )
      expect(
        (span.events ?? []).filter((event) => event.name === 'exception')
      ).toEqual(
        isHttpError
          ? [
              expect.objectContaining({
                attributes: {
                  'exception.type': 'Error',
                  'exception.message': `Fetch failed with HTTP status ${status}`,
                },
              }),
            ]
          : []
      )
      expect(span.error).toEqual(
        isHttpError
          ? {
              type: 'Error',
              message: `Fetch failed with HTTP status ${status}`,
            }
          : undefined
      )
      expect(workStore.fetchMetrics?.length ?? 0).toBe(
        shouldTrackFetchMetrics ? 1 : 0
      )
    }
  )

  it.each([
    { cachedStatus: 404, originStatus: 200, isStale: false },
    { cachedStatus: 200, originStatus: 503, isStale: true },
  ])(
    'classifies cached HTTP $cachedStatus with background HTTP $originStatus, stale=$isStale',
    async ({ cachedStatus, originStatus, isStale }) => {
      setSpanRecorderForTest((span) => spanRecords.push(span))

      const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
      mockFetch.mockResolvedValue(
        new Response('origin body', { status: originStatus })
      )
      const incrementalCache = {
        get: jest.fn().mockResolvedValue({
          isStale,
          value: {
            kind: CachedRouteKind.FETCH,
            revalidate: 3600,
            data: {
              body: btoa('cached body'),
              headers: {},
              status: cachedStatus,
              url: 'https://example.com/api',
            },
          },
        }),
        generateCacheKey: jest.fn().mockResolvedValue('test-cache-key'),
        lock: jest.fn().mockResolvedValue(() => {}),
      } as unknown as IncrementalCache
      const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
      const patchedFetch = createPatchedFetcher(mockFetch, {
        workAsyncStorage,
        workUnitAsyncStorage: new AsyncLocalStorage<WorkUnitStore>(),
      })
      const workStore: Partial<WorkStore> = {
        page: '/',
        route: '/',
        incrementalCache,
      }

      const response = await workAsyncStorage.run(workStore as WorkStore, () =>
        patchedFetch('https://example.com/api', { cache: 'force-cache' })
      )
      await Promise.all(Object.values(workStore.pendingRevalidates ?? {}))

      expect(response.status).toBe(cachedStatus)
      expect(await response.text()).toBe('cached body')
      expect(mockFetch).toHaveBeenCalledTimes(isStale ? 1 : 0)
      expect(spanRecords).toHaveLength(1)
      expect(spanRecords[0].status).toBe(cachedStatus === 404 ? 'error' : 'ok')
      expect(spanRecords[0].attributes?.['http.status_code']).toBe(cachedStatus)
      expect(spanRecords[0].attributes?.['next.fetch.cache_status']).toBe('hit')
      expect(spanRecords[0].attributes?.['error.type']).toBe(
        cachedStatus === 404 ? '404' : undefined
      )
      expect(
        (spanRecords[0].events ?? []).filter(
          (event) => event.name === 'exception'
        )
      ).toHaveLength(cachedStatus === 404 ? 1 : 0)
    }
  )

  it('records an HTTP error without buffering the response stream', async () => {
    setSpanRecorderForTest((span) => spanRecords.push(span))
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const readableStream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
        controller.enqueue(new TextEncoder().encode('stream start'))
      },
    })
    const originResponse = new Response(readableStream, { status: 500 })
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
    mockFetch.mockResolvedValue(originResponse)
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage: new AsyncLocalStorage<WorkUnitStore>(),
    })

    const response = await workAsyncStorage.run(
      { page: '/', route: '/' } as WorkStore,
      () => patchedFetch('https://example.com/api', { cache: 'no-store' })
    )

    expect(response).toBe(originResponse)
    expect(response.bodyUsed).toBe(false)
    expect(spanRecords).toHaveLength(1)
    expect(spanRecords[0].status).toBe('error')
    controller.close()
    expect(await response.text()).toBe('stream start')
  }, 1000)

  it('preserves the original exception when fetch rejects', async () => {
    setSpanRecorderForTest((span) => spanRecords.push(span))
    const error = new TypeError('fetch failed')
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
    mockFetch.mockRejectedValue(error)
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage: new AsyncLocalStorage<WorkUnitStore>(),
    })

    await expect(
      workAsyncStorage.run({ page: '/', route: '/' } as WorkStore, () =>
        patchedFetch('https://example.com/api', { cache: 'no-store' })
      )
    ).rejects.toBe(error)

    expect(spanRecords).toHaveLength(1)
    expect(spanRecords[0].status).toBe('error')
    expect(spanRecords[0].attributes?.['error.type']).toBe('TypeError')
    expect(spanRecords[0].events).toEqual([
      expect.objectContaining({
        name: 'exception',
        attributes: {
          'exception.type': 'TypeError',
          'exception.message': 'fetch failed',
        },
      }),
    ])
  })

  it('returns HTTP error responses when fetch spans are disabled', async () => {
    setSpanRecorderForTest((span) => spanRecords.push(span))
    const originalOtelFetchDisabled = process.env.NEXT_OTEL_FETCH_DISABLED
    process.env.NEXT_OTEL_FETCH_DISABLED = '1'

    try {
      const originResponse = new Response('response body', { status: 404 })
      const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
      mockFetch.mockResolvedValue(originResponse)
      const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
      const patchedFetch = createPatchedFetcher(mockFetch, {
        workAsyncStorage,
        workUnitAsyncStorage: new AsyncLocalStorage<WorkUnitStore>(),
      })

      const response = await workAsyncStorage.run(
        { page: '/', route: '/' } as WorkStore,
        () => patchedFetch('https://example.com/api', { cache: 'no-store' })
      )

      expect(response).toBe(originResponse)
      expect(await response.text()).toBe('response body')
      expect(spanRecords).toEqual([])
    } finally {
      if (originalOtelFetchDisabled === undefined) {
        delete process.env.NEXT_OTEL_FETCH_DISABLED
      } else {
        process.env.NEXT_OTEL_FETCH_DISABLED = originalOtelFetchDisabled
      }
    }
  })
})

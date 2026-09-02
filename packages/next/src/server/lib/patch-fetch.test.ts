import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from './incremental-cache'
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
})

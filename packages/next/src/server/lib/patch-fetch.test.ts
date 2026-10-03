import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from './incremental-cache'
import { INFINITE_CACHE } from '../../lib/constants'
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

  describe('fetch options', () => {
    function setup(
      type: WorkUnitStore['type'],
      createFetcher: typeof createPatchedFetcher = createPatchedFetcher
    ) {
      const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
      mockFetch.mockImplementation(async () => new Response('ok'))

      const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
      const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
      const patchedFetch = createFetcher(mockFetch, {
        workAsyncStorage,
        workUnitAsyncStorage,
      })

      const unlock = jest.fn()
      const incrementalCache = {
        get: jest.fn(async () => null),
        set: jest.fn(),
        generateCacheKey: jest.fn(async (url: string) => url),
        lock: jest.fn(async () => unlock),
      } as unknown as IncrementalCache

      // We only need to provide a few of the WorkStore properties.
      const workStore: Partial<WorkStore> = {
        page: '/',
        route: '/',
        incrementalCache,
      }

      // We only need to provide the work unit store properties that are read
      // while processing the fetch config.
      const workUnitStore = {
        type,
        implicitTags: undefined,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: null,
      } as unknown as WorkUnitStore

      const run = (callback: () => Promise<void>) =>
        workAsyncStorage.run(workStore as WorkStore, () =>
          workUnitAsyncStorage.run(workUnitStore, async () => {
            await callback()
            // Wait for the fetch cache entries to be written.
            await Promise.all(Object.values(workStore.pendingRevalidates ?? {}))
          })
        )

      return { patchedFetch, mockFetch, incrementalCache, unlock, run }
    }

    it('does not mutate an options object that is reused across fetches', async () => {
      const { patchedFetch, mockFetch, incrementalCache, run } =
        setup('prerender-legacy')
      const options: RequestInit = {
        next: { revalidate: 60, tags: ['posts'] },
      }

      await run(async () => {
        await (await patchedFetch('https://example.com/a', options)).text()
        await (await patchedFetch('https://example.com/b', options)).text()
      })

      // Both fetches are cached with the configured revalidate and tags.
      expect(incrementalCache.set).toHaveBeenCalledTimes(2)
      for (const url of ['https://example.com/a', 'https://example.com/b']) {
        expect(incrementalCache.set).toHaveBeenCalledWith(
          url,
          expect.objectContaining({ kind: 'FETCH', revalidate: 60 }),
          expect.objectContaining({ fetchUrl: url, tags: ['posts'] })
        )
      }

      expect(options).toEqual({ next: { revalidate: 60, tags: ['posts'] } })

      // The origin fetch still doesn't receive the user's `next` config.
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://example.com/a',
        expect.objectContaining({ next: { fetchType: 'origin', fetchIdx: 1 } })
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example.com/b',
        expect.objectContaining({ next: { fetchType: 'origin', fetchIdx: 2 } })
      )
    })

    it.each([
      'prerender',
      'prerender-client',
      'cache',
      'private-cache',
      'unstable-cache',
    ] as const)(
      'does not mutate the options object for a %s work unit',
      async (type) => {
        const { patchedFetch, run } = setup(type)
        const options: RequestInit = {
          next: { revalidate: 60, tags: ['posts'] },
        }

        await run(async () => {
          await (await patchedFetch('https://example.com', options)).text()
        })

        expect(options).toEqual({ next: { revalidate: 60, tags: ['posts'] } })
      }
    )

    it('does not throw for a frozen options object', async () => {
      const { patchedFetch, unlock, run } = setup('prerender-legacy')
      const options = Object.freeze({
        next: Object.freeze({ revalidate: 60 }),
      })

      await run(async () => {
        const response = await patchedFetch('https://example.com', options)
        expect(await response.text()).toBe('ok')
      })

      // The fetch cache lock is released.
      expect(unlock).toHaveBeenCalled()
    })

    async function withEdgeRuntime(
      callback: (
        createEdgePatchedFetcher: typeof createPatchedFetcher
      ) => Promise<void>
    ) {
      const previousRuntime = process.env.NEXT_RUNTIME
      process.env.NEXT_RUNTIME = 'edge'

      try {
        // The runtime is read when the module is evaluated.
        let createEdgePatchedFetcher: typeof createPatchedFetcher | undefined
        jest.isolateModules(() => {
          ;({ createPatchedFetcher: createEdgePatchedFetcher } =
            require('./patch-fetch') as typeof import('./patch-fetch'))
        })

        await callback(createEdgePatchedFetcher!)
      } finally {
        if (previousRuntime === undefined) {
          delete process.env.NEXT_RUNTIME
        } else {
          process.env.NEXT_RUNTIME = previousRuntime
        }
      }
    }

    it('does not mutate the options object on the edge runtime', async () => {
      await withEdgeRuntime(async (createEdgePatchedFetcher) => {
        const { patchedFetch, mockFetch, run } = setup(
          'unstable-cache',
          createEdgePatchedFetcher
        )
        const options: RequestInit = {
          cache: 'force-cache',
          next: { revalidate: 60 },
        }

        await run(async () => {
          await (await patchedFetch('https://example.com', options)).text()
        })

        expect(options).toEqual({
          cache: 'force-cache',
          next: { revalidate: 60 },
        })

        // `cache` is still removed from the options of the origin fetch.
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('cache')
      })
    })

    it.each([
      ['a mutable', (): RequestInit => ({ cache: 'force-cache' })],
      ['a frozen', (): RequestInit => Object.freeze({ cache: 'force-cache' })],
    ])(
      'does not mutate %s options object with only `cache` on the edge runtime',
      async (_, createOptions) => {
        await withEdgeRuntime(async (createEdgePatchedFetcher) => {
          const { patchedFetch, mockFetch, run } = setup(
            'unstable-cache',
            createEdgePatchedFetcher
          )
          const options = createOptions()

          await run(async () => {
            await (await patchedFetch('https://example.com', options)).text()
          })

          expect(options).toEqual({ cache: 'force-cache' })

          // `cache` is still removed from the options of the origin fetch.
          expect(mockFetch).toHaveBeenCalledTimes(1)
          expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('cache')
        })
      }
    )
  })
})

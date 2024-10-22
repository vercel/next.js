import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from './incremental-cache'
import { createPatchedFetcher } from './patch-fetch'

describe('createPatchedFetcher', () => {
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
      lock: jest.fn(() => resolveIncrementalCacheSet),
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
          revalidate: false,
          tags: [],
        }
      )
    })
    // Setting a lower timeout than default, because the test will fail with a
    // timeout when we regress and buffer the response.
  }, 1000)

  it('should overwrite existing status 200 cache after 404 response', async () => {
    // make http cache with res 200 and cache
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn()
    mockFetch.mockResolvedValue(
      new Response('{"data": "hello"}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    )

    const staticGenerationAsyncStorage =
      new AsyncLocalStorage<StaticGenerationStore>()

    const prerenderAsyncStorage = new AsyncLocalStorage<PrerenderStore>()

    const patchedFetch = createPatchedFetcher(mockFetch, {
      // requestAsyncStorage does not need to provide a store for this test.
      requestAsyncStorage: new AsyncLocalStorage<RequestStore>(),
      staticGenerationAsyncStorage,
      prerenderAsyncStorage,
    })

    let resolveIncrementalCacheSet: () => void

    let incrementalCacheSetPromise = new Promise<void>((resolve) => {
      resolveIncrementalCacheSet = resolve
    })

    const incrementalCache = {
      get: jest.fn(),
      set: jest.fn(() => resolveIncrementalCacheSet()),
      generateCacheKey: jest.fn(() => 'test-cache-key'),
      lock: jest.fn(() => resolveIncrementalCacheSet),
    } as unknown as IncrementalCache

    // We only need to provide a few of the StaticGenerationStore properties.
    const staticGenerationStore: Partial<StaticGenerationStore> = {
      page: '/',
      route: '/',
      incrementalCache,
    }

    await staticGenerationAsyncStorage.run(
      staticGenerationStore as StaticGenerationStore,
      async () => {
        const response = await patchedFetch('https://example.com', {
          cache: 'force-cache',
        })

        if (!response.body) {
          throw new Error(`Response body is ${JSON.stringify(response.body)}.`)
        }

        const reader = response.body.getReader()
        let result = await reader.read()
        expect(result.done).toBe(false)
        expect(new TextDecoder().decode(result.value)).toBe('{"data": "hello"}')

        await incrementalCacheSetPromise

        expect(incrementalCache.set).toHaveBeenCalledTimes(1)
        expect(incrementalCache.set).toHaveBeenCalledWith(
          'test-cache-key',
          {
            data: {
              body: btoa('{"data": "hello"}'),
              headers: {
                'content-type': 'application/json',
              },
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
            revalidate: false,
            tags: [],
          }
        )

        incrementalCacheSetPromise = new Promise<void>((resolve) => {
          resolveIncrementalCacheSet = resolve
        })

        mockFetch.mockResolvedValue(
          new Response('{"data": "none"}', {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
            },
          })
        )

        const response2 = await patchedFetch('https://example.com', {
          cache: 'force-cache',
        })

        if (!response2.body) {
          throw new Error(`Response body is ${JSON.stringify(response.body)}.`)
        }

        const reader2 = response2.body.getReader()
        const result2 = await reader2.read()
        expect(result2.done).toBe(false)
        expect(new TextDecoder().decode(result2.value)).toBe('{"data": "none"}')

        await incrementalCacheSetPromise

        expect(incrementalCache.set).toHaveBeenCalledTimes(2)

        expect(incrementalCache.set).toHaveBeenCalledWith(
          'test-cache-key',
          {
            data: {
              body: btoa('{"data": "none"}'),
              headers: {
                'content-type': 'application/json',
              },
              status: 404,
              url: '', // the mocked response does not have a URL
            },
            kind: 'FETCH',
            revalidate: 31536000, // default of one year
          },
          {
            fetchCache: true,
            fetchIdx: 2,
            fetchUrl: 'https://example.com/',
            revalidate: false,
            tags: [],
          }
        )
      }
    )
  })
})

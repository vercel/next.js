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
})

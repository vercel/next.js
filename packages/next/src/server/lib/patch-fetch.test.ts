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

  it('should preserve Request body source for uncached POST requests', async () => {
    const http = (require('node:http') as typeof import('node:http'))

    // Use a real HTTP server so the request goes through undici,
    // which validates the internal body source on Node >= 24.14.0.
    const server = http.createServer(
      (
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse
      ) => {
        req.resume()
        req.on('end', () => {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 401 }))
        })
      }
    )

    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as import('node:net').AddressInfo).port

    try {
      const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
      const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()

      const patchedFetch = createPatchedFetcher(fetch, {
        workAsyncStorage,
        workUnitAsyncStorage,
      })

      const workStore: Partial<WorkStore> = {
        page: '/',
        route: '/',
      }

      await workAsyncStorage.run(workStore as WorkStore, async () => {
        const body = JSON.stringify({ key: 'value' })
        const request = new Request(`http://localhost:${port}`, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
        })

        const response = await patchedFetch(request)
        expect(response.status).toBe(401)
      })
    } finally {
      server.close()
    }
  })
})

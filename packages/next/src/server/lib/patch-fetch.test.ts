import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from './incremental-cache'
import { createPatchedFetcher } from './patch-fetch'
import { registerLocalSpanRecorder } from './trace/local-span-recorder'
import { RequestInsights } from './trace/request-insights'
import {
  getRequestInsightsCausalTarget,
  takeRequestInsightsCausalToken,
} from './trace/request-insights-causal'
import {
  createRequestInsightsRetentionContext,
  getRequestInsightsIdentity,
  runWithRequestInsightsIdentity,
  type RequestInsightsIdentity,
} from './trace/request-insights-identity'
import { runWithRequestInsights } from './trace/request-insights-runtime'
import { prepareRequestInsightsSandboxFetch } from './trace/request-insights-sandbox-fetch'
import {
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './trace/span-store'

const originalDevServer = process.env.__NEXT_DEV_SERVER
const spanRecords: SpanStoreRecord[] = []

function createTestRequestInsightsIdentity(requestId: string) {
  return {
    requestId,
    rootRequestId: `${requestId}-root`,
    retention: createRequestInsightsRetentionContext(),
    htmlRequestId: requestId,
    origin: 'http://app.localhost',
    url: '/',
  }
}

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

  it('keeps a same-origin causal link on the captured controller after context exit', async () => {
    const requestInsights = new RequestInsights()
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const target = getRequestInsightsCausalTarget(
      new URL('http://app.localhost/api/child'),
      'GET'
    )!
    let causalParent:
      | { parentRootRequestId: string; parentFetchIndex: number }
      | undefined
    let releaseFetch!: () => void
    const fetchCanFinish = new Promise<void>((resolve) => {
      releaseFetch = resolve
    })
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input, init) => {
        const headers = Object.fromEntries(new Headers(init?.headers))
        const token = takeRequestInsightsCausalToken(headers)
        causalParent = token
          ? requestInsights.consumeCausalToken(token, target)
          : undefined
        await fetchCanFinish
        return new Response('ok', { status: 201 })
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = {
      page: '/',
      route: '/',
    } as WorkStore

    const responsePromise = runWithRequestInsights(requestInsights, () =>
      runWithRequestInsightsIdentity(
        createTestRequestInsightsIdentity('parent-request'),
        () =>
          workAsyncStorage.run(workStore, () =>
            patchedFetch('http://app.localhost/api/child', {
              cache: 'no-store',
            })
          )
      )
    )

    expect(getRequestInsightsIdentity()).toBeUndefined()
    expect(causalParent).toEqual({
      parentRootRequestId: 'parent-request-root',
      parentFetchIndex: 1,
    })
    releaseFetch()
    expect((await responsePromise).status).toBe(201)
    expect(requestInsights.getSnapshot().requests[0]?.fetches[0]).toEqual(
      expect.objectContaining({ index: 1, statusCode: 201 })
    )
    requestInsights.dispose()
  })

  it('deduplicates mixed Edge and Node fetches with shared insight indexes', async () => {
    setSpanRecorderForTest((span) => spanRecords.push(span))
    const requestInsights = new RequestInsights()
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const identity: RequestInsightsIdentity = {
      requestId: 'mixed-runtime-parent',
      rootRequestId: 'mixed-runtime-parent-root',
      htmlRequestId: 'mixed-runtime-parent',
      origin: 'http://app.localhost',
      url: '/',
    }
    prepareRequestInsightsSandboxFetch({
      context: { identity, requestInsights },
      init: {},
      url: 'https://example.com/from-edge',
    }).complete({ status: 200 })

    const target = getRequestInsightsCausalTarget(
      new URL('http://app.localhost/api/from-node'),
      'GET'
    )!
    let causalParent:
      | { parentRootRequestId: string; parentFetchIndex: number }
      | undefined
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input, init) => {
        const token = takeRequestInsightsCausalToken(
          Object.fromEntries(new Headers(init?.headers))
        )
        causalParent = token
          ? requestInsights.consumeCausalToken(token, target)
          : undefined
        return new Response('ok', { status: 201 })
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = { nextFetchId: 7, page: '/', route: '/' } as WorkStore

    await runWithRequestInsights(requestInsights, () =>
      runWithRequestInsightsIdentity(identity, () =>
        workAsyncStorage.run(workStore, () =>
          patchedFetch('http://app.localhost/api/from-node', {
            cache: 'no-store',
          })
        )
      )
    )

    expect(causalParent).toEqual({
      parentRootRequestId: 'mixed-runtime-parent-root',
      parentFetchIndex: 2,
    })
    expect(
      spanRecords.find(
        (span) =>
          span.attributes?.['next.span_type'] === 'AppRender.fetch' &&
          span.url === 'http://app.localhost/api/from-node'
      )
    ).toEqual(
      expect.objectContaining({
        requestInsightFetchIndex: 2,
        attributes: expect.objectContaining({ 'next.fetch.idx': 8 }),
      })
    )
    expect(requestInsights.getSnapshot().requests[0].fetches).toEqual([
      expect.objectContaining({
        index: 1,
        statusCode: 200,
        url: 'https://example.com/from-edge',
      }),
      expect.objectContaining({
        index: 2,
        statusCode: 201,
        url: 'http://app.localhost/api/from-node',
      }),
    ])
    requestInsights.dispose()
  })

  it('revokes a causal token when the original fetch throws synchronously', async () => {
    const requestInsights = new RequestInsights()
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const target = getRequestInsightsCausalTarget(
      new URL('http://app.localhost/api/child'),
      'GET'
    )!
    let causalToken: string | undefined
    const error = new Error('synchronous fetch failure')
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      (_input, init) => {
        causalToken = takeRequestInsightsCausalToken(
          Object.fromEntries(new Headers(init?.headers))
        )
        throw error
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = {
      page: '/',
      route: '/',
    } as WorkStore

    const response = runWithRequestInsights(requestInsights, () =>
      runWithRequestInsightsIdentity(
        createTestRequestInsightsIdentity('parent-request'),
        () =>
          workAsyncStorage.run(workStore, () =>
            patchedFetch('http://app.localhost/api/child', {
              cache: 'no-store',
            })
          )
      )
    )

    await expect(response).rejects.toBe(error)
    expect(causalToken).toBeDefined()
    expect(
      requestInsights.consumeCausalToken(causalToken!, target)
    ).toBeUndefined()
    requestInsights.dispose()
  })

  it('leaves draft-mode fetch state and headers unchanged', async () => {
    setSpanRecorderForTest((span) => spanRecords.push(span))
    const requestInsights = new RequestInsights()
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const init = {
      cache: 'no-store' as const,
      headers: {
        cookie: '__next_request_insights_causal=user-value; user=value',
      },
    }
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input, receivedInit) => {
        expect(receivedInit).toBe(init)
        return new Response('ok')
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = {
      isDraftMode: true,
      nextFetchId: 7,
      page: '/',
      route: '/',
      shouldTrackFetchMetrics: true,
    } as WorkStore

    await runWithRequestInsights(requestInsights, () =>
      runWithRequestInsightsIdentity(
        createTestRequestInsightsIdentity('draft-request'),
        () =>
          workAsyncStorage.run(workStore, () =>
            patchedFetch('http://app.localhost/api/child', init)
          )
      )
    )

    expect(workStore.nextFetchId).toBe(7)
    expect(workStore.fetchMetrics).toBeUndefined()
    expect(requestInsights.getSnapshot().requests[0]?.fetches[0]).toEqual(
      expect.objectContaining({
        cacheStatus: undefined,
        index: undefined,
        statusCode: undefined,
      })
    )
    expect(
      spanRecords.find(
        (span) => span.name === 'fetch GET http://app.localhost/api/child'
      )?.attributes
    ).not.toEqual(
      expect.objectContaining({
        'next.fetch.idx': expect.anything(),
      })
    )
    requestInsights.dispose()
  })

  it('does not reserve a user cookie while Request Insights is disabled', async () => {
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const cookie = '__next_request_insights_causal=user-value; user=value'
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input, init) => {
        expect(new Headers(init?.headers).get('cookie')).toBe(cookie)
        return new Response('ok')
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = { page: '/', route: '/' } as WorkStore

    await workAsyncStorage.run(workStore, () =>
      patchedFetch('http://app.localhost/api/child', {
        cache: 'no-store',
        headers: { cookie },
      })
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not attach causality when credentials are omitted', async () => {
    const requestInsights = new RequestInsights()
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    let causalToken: string | undefined
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (_input, init) => {
        const headers = Object.fromEntries(new Headers(init?.headers))
        causalToken = takeRequestInsightsCausalToken(headers)
        expect(headers.cookie).toBe('session=value')
        return new Response('ok')
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = { page: '/', route: '/' } as WorkStore

    await runWithRequestInsights(requestInsights, () =>
      runWithRequestInsightsIdentity(
        createTestRequestInsightsIdentity('parent-request'),
        () =>
          workAsyncStorage.run(workStore, () =>
            patchedFetch('http://app.localhost/api/child', {
              cache: 'no-store',
              credentials: 'omit',
              headers: { cookie: 'session=value' },
            })
          )
      )
    )

    expect(causalToken).toBeUndefined()
    requestInsights.dispose()
  })

  it('preserves a streamed POST Request body while attaching causality', async () => {
    const requestInsights = new RequestInsights()
    const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
    const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
    const target = getRequestInsightsCausalTarget(
      new URL('http://app.localhost/api/child'),
      'POST'
    )!
    let causalParent:
      | { parentRootRequestId: string; parentFetchIndex: number }
      | undefined
    let receivedBody: string | undefined
    const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
      async (input, init) => {
        const request = new Request(input, init)
        const headers = Object.fromEntries(request.headers)
        const token = takeRequestInsightsCausalToken(headers)
        causalParent = token
          ? requestInsights.consumeCausalToken(token, target)
          : undefined
        expect(headers.cookie).toBe('session=value')
        receivedBody = await request.text()
        return new Response('ok')
      }
    )
    const patchedFetch = createPatchedFetcher(mockFetch, {
      workAsyncStorage,
      workUnitAsyncStorage,
    })
    const workStore = { page: '/', route: '/' } as WorkStore
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('streamed body'))
        controller.close()
      },
    })
    const request = new Request('http://app.localhost/api/child', {
      body,
      // @ts-expect-error -- Node fetch requires duplex for streamed bodies.
      duplex: 'half',
      headers: { cookie: 'session=value' },
      method: 'POST',
    })

    await runWithRequestInsights(requestInsights, () =>
      runWithRequestInsightsIdentity(
        createTestRequestInsightsIdentity('parent-request'),
        () =>
          workAsyncStorage.run(workStore, () =>
            patchedFetch(request, undefined)
          )
      )
    )

    expect(receivedBody).toBe('streamed body')
    expect(causalParent).toEqual({
      parentRootRequestId: 'parent-request-root',
      parentFetchIndex: 1,
    })
    requestInsights.dispose()
  })

  it.each([
    { isStale: false, expectedOriginCalls: 0 },
    { isStale: true, expectedOriginCalls: 1 },
  ])(
    'does not attach causality for a cache hit with isStale=$isStale',
    async ({ isStale, expectedOriginCalls }) => {
      const requestInsights = new RequestInsights()
      const workAsyncStorage = new AsyncLocalStorage<WorkStore>()
      const workUnitAsyncStorage = new AsyncLocalStorage<WorkUnitStore>()
      let causalToken: string | undefined
      const mockFetch: jest.MockedFunction<typeof fetch> = jest.fn(
        async (_input, init) => {
          causalToken = takeRequestInsightsCausalToken(
            Object.fromEntries(new Headers(init?.headers))
          )
          return new Response('fresh')
        }
      )
      const incrementalCache = {
        generateCacheKey: jest.fn(() => 'cache-key'),
        get: jest.fn(() => ({
          isStale,
          value: {
            kind: 'FETCH',
            data: {
              body: Buffer.from('cached').toString('base64'),
              headers: {},
              status: 200,
              url: 'http://app.localhost/api/child',
            },
            revalidate: 60,
          },
        })),
        lock: jest.fn(() => () => {}),
        set: jest.fn(),
      } as unknown as IncrementalCache
      const patchedFetch = createPatchedFetcher(mockFetch, {
        workAsyncStorage,
        workUnitAsyncStorage,
      })
      const workStore = {
        incrementalCache,
        page: '/',
        route: '/',
      } as WorkStore

      const response = await runWithRequestInsights(requestInsights, () =>
        runWithRequestInsightsIdentity(
          createTestRequestInsightsIdentity('parent-request'),
          () =>
            workAsyncStorage.run(workStore, () =>
              patchedFetch('http://app.localhost/api/child', {
                cache: 'force-cache',
              })
            )
        )
      )

      expect(await response.text()).toBe('cached')
      await workStore.pendingRevalidates?.['cache-key']
      expect(mockFetch).toHaveBeenCalledTimes(expectedOriginCalls)
      expect(causalToken).toBeUndefined()
      requestInsights.dispose()
    }
  )

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

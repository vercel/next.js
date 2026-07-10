import { AsyncLocalStorage } from 'node:async_hooks'
import type { WorkUnitStore } from '../app-render/work-unit-async-storage.external'
import type { WorkStore } from '../app-render/work-async-storage.external'
import type { IncrementalCache } from './incremental-cache'
import {
  createPatchedFetcher,
  NEXT_PATCH_SYMBOL,
  patchFetch,
  unpatchFetch,
} from './patch-fetch'

describe('createPatchedFetcher', () => {
  // `createPatchedFetcher` flips `NEXT_PATCH_SYMBOL` to true as part of
  // building the wrapper but never clears it, which would make `patchFetch`
  // early-return for any later test in this file. Reset after each test so
  // the next describe block starts from a clean baseline regardless of
  // jest test ordering.
  afterEach(() => {
    ;(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false
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
})

describe('patchFetch / unpatchFetch lazy snapshot', () => {
  // Save the real fetch so we can restore it after each test.
  const realFetch = globalThis.fetch
  const globalSyms = globalThis as Record<symbol, unknown>

  function makeOptions() {
    return {
      workAsyncStorage: new AsyncLocalStorage<WorkStore>(),
      workUnitAsyncStorage: new AsyncLocalStorage<WorkUnitStore>(),
    }
  }

  function makeOTelLikeWrapper(): typeof globalThis.fetch {
    const wrapped = (...args: Parameters<typeof globalThis.fetch>) =>
      realFetch(...args)
    Object.defineProperty(wrapped, 'name', { value: 'otelFetchWrapper' })
    return wrapped as typeof globalThis.fetch
  }

  afterEach(() => {
    globalThis.fetch = realFetch
    globalSyms[NEXT_PATCH_SYMBOL] = false
  })

  it('preserves an OTel-like wrapper across patchFetch -> unpatchFetch', () => {
    const otelFetch = makeOTelLikeWrapper()
    globalThis.fetch = otelFetch

    patchFetch(makeOptions())
    // Next.js layer is now installed.
    expect(globalThis.fetch).not.toBe(otelFetch)
    expect((globalThis.fetch as any).__nextPatched).toBe(true)

    unpatchFetch()
    // After HMR-style reset we land back on the OTel wrapper, not the raw fetch.
    expect(globalThis.fetch).toBe(otelFetch)
    expect(globalThis.fetch).not.toBe(realFetch)
  })

  it('re-patching after unpatch keeps the OTel wrapper underneath', () => {
    const otelFetch = makeOTelLikeWrapper()
    globalThis.fetch = otelFetch

    patchFetch(makeOptions())
    unpatchFetch()
    patchFetch(makeOptions())

    expect(globalThis.fetch).not.toBe(otelFetch)
    expect((globalThis.fetch as any).__nextPatched).toBe(true)
    // The Next.js layer wraps the dedupe layer, which wraps the OTel wrapper.
    // We only assert reachability through the documented escape hatch.
    expect((globalThis.fetch as any)._nextOriginalFetch).toBeDefined()

    unpatchFetch()
    expect(globalThis.fetch).toBe(otelFetch)
  })

  it('re-entrant patchFetch does not overwrite the snapshot with the patched fetch', () => {
    const otelFetch = makeOTelLikeWrapper()
    globalThis.fetch = otelFetch

    patchFetch(makeOptions())
    const patchedAfterFirstCall = globalThis.fetch
    // A second call while still patched is a no-op and must not move the
    // snapshot forward (otherwise unpatch would land on the Next.js layer).
    patchFetch(makeOptions())
    expect(globalThis.fetch).toBe(patchedAfterFirstCall)

    unpatchFetch()
    expect(globalThis.fetch).toBe(otelFetch)
  })

  it('drops userland fetch mutations applied after patchFetch', () => {
    const otelFetch = makeOTelLikeWrapper()
    globalThis.fetch = otelFetch

    patchFetch(makeOptions())

    // Simulate userland code (e.g. a route module's top-level) wrapping
    // globalThis.fetch *after* Next.js has already patched it. By design,
    // unpatchFetch restores the snapshot taken before the Next.js patch,
    // so this post-patch wrapper does NOT survive HMR — only wrappers
    // installed before patchFetch ran (e.g. instrumentation hooks) do.
    const userlandFetch = (...args: Parameters<typeof globalThis.fetch>) =>
      realFetch(...args)
    Object.defineProperty(userlandFetch, 'name', { value: 'userlandWrapper' })
    globalThis.fetch = userlandFetch as typeof globalThis.fetch

    unpatchFetch()
    expect(globalThis.fetch).toBe(otelFetch)
    expect(globalThis.fetch).not.toBe(userlandFetch)
  })

  it('captures a fresh snapshot on each patchFetch / unpatch cycle', () => {
    const firstFetch = makeOTelLikeWrapper()
    globalThis.fetch = firstFetch
    patchFetch(makeOptions())
    unpatchFetch()
    expect(globalThis.fetch).toBe(firstFetch)

    // Between cycles, the live fetch shifts (e.g. instrumentation re-arms
    // itself with a fresh wrapper). The next patch/unpatch must restore
    // to *that* wrapper, not the stale `firstFetch` from the prior cycle.
    const secondFetch = makeOTelLikeWrapper()
    Object.defineProperty(secondFetch, 'name', { value: 'secondOtelWrapper' })
    globalThis.fetch = secondFetch
    patchFetch(makeOptions())
    unpatchFetch()
    expect(globalThis.fetch).toBe(secondFetch)
    expect(globalThis.fetch).not.toBe(firstFetch)
  })
})

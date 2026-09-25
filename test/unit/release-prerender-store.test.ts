/* eslint-env jest */
import {
  releasePrerenderStore,
  type PrerenderStoreModernServer,
  type PrerenderStoreModernRuntime,
  type PrerenderStoreModernClient,
} from '../../packages/next/src/server/app-render/work-unit-async-storage.external'

describe('releasePrerenderStore', () => {
  it('safely handles null and undefined', () => {
    expect(() => releasePrerenderStore(null)).not.toThrow()
    expect(() => releasePrerenderStore(undefined)).not.toThrow()
  })

  it('releases heavy references from a prerender store while preserving metadata', () => {
    const mockController = new AbortController()
    const mockResumeDataCache = {} as any
    const mockStagedRendering = {} as any
    const mockVaryParamsAccumulator = {} as any
    const mockDynamicTracking = {} as any
    const mockPrerenderDataTracking = {} as any
    const mockCacheSignal = {} as any

    const store: PrerenderStoreModernServer = {
      type: 'prerender',
      phase: 'render',
      rootParams: { slug: 'test' },
      implicitTags: { tags: ['tag1'] },
      fallbackRouteParams: null,
      renderSignal: mockController.signal,
      controller: mockController,
      stagedRendering: mockStagedRendering,
      cacheSignal: mockCacheSignal,
      dynamicTracking: mockDynamicTracking,
      revalidate: 60,
      expire: 300,
      stale: 600,
      tags: ['tag1'],
      resumeDataCache: mockResumeDataCache,
      hmrRefreshHash: undefined,
      varyParamsAccumulator: mockVaryParamsAccumulator,
      prerenderDataTracking: mockPrerenderDataTracking,
      isFallbackUpgradeable: true,
    }

    releasePrerenderStore(store)

    // Heavy render references are cleared
    expect(store.resumeDataCache).toBeNull()
    expect(store.controller).toBeNull()
    expect(store.renderSignal).toBeNull()
    expect(store.cacheSignal).toBeNull()
    expect(store.stagedRendering).toBeNull()
    expect(store.varyParamsAccumulator).toBeNull()
    expect(store.dynamicTracking).toBeNull()
    expect(store.prerenderDataTracking).toBeNull()

    // Revalidate and route metadata are preserved
    expect(store.revalidate).toBe(60)
    expect(store.expire).toBe(300)
    expect(store.stale).toBe(600)
    expect(store.tags).toEqual(['tag1'])
    expect(store.rootParams).toEqual({ slug: 'test' })
  })

  it('releases heavy references from a prerender-runtime store including headers and cookies', () => {
    const mockController = new AbortController()
    const mockResumeDataCache = {} as any
    const mockHeaders = {} as any
    const mockCookies = {} as any
    const mockDraftMode = {} as any

    const store: PrerenderStoreModernRuntime = {
      type: 'prerender-runtime',
      phase: 'render',
      rootParams: { slug: 'runtime' },
      implicitTags: { tags: [] },
      renderSignal: mockController.signal,
      controller: mockController,
      cacheSignal: null,
      dynamicTracking: null,
      revalidate: 1,
      expire: 0,
      stale: 0,
      tags: [],
      resumeDataCache: mockResumeDataCache,
      hmrRefreshHash: undefined,
      varyParamsAccumulator: null,
      stagedRendering: null,
      finalStage: 0 as any,
      headers: mockHeaders,
      cookies: mockCookies,
      draftMode: mockDraftMode,
    }

    releasePrerenderStore(store)

    expect(store.resumeDataCache).toBeNull()
    expect(store.controller).toBeNull()
    expect(store.renderSignal).toBeNull()
    expect(store.headers).toBeNull()
    expect(store.cookies).toBeNull()
    expect(store.draftMode).toBeNull()
    expect(store.rootParams).toEqual({ slug: 'runtime' })
  })

  it('releases heavy references from a prerender-client store', () => {
    const mockController = new AbortController()
    const mockResumeDataCache = {} as any

    const store: PrerenderStoreModernClient = {
      type: 'prerender-client',
      phase: 'render',
      rootParams: {},
      implicitTags: { tags: [] },
      fallbackRouteParams: null,
      renderSignal: mockController.signal,
      controller: mockController,
      cacheSignal: null,
      dynamicTracking: null,
      revalidate: 1,
      expire: 0,
      stale: 0,
      tags: [],
      resumeDataCache: mockResumeDataCache,
      hmrRefreshHash: undefined,
      varyParamsAccumulator: null,
    }

    releasePrerenderStore(store)

    expect(store.resumeDataCache).toBeNull()
    expect(store.controller).toBeNull()
    expect(store.renderSignal).toBeNull()
  })

  it('sanitizes abort reason stack frames on controller and renderSignal to prevent CallSite closure retention', () => {
    const mockController = new AbortController()
    const errorWithStack = new Error('Render aborted')
    mockController.abort(errorWithStack)

    const store: PrerenderStoreModernServer = {
      type: 'prerender',
      phase: 'render',
      rootParams: {},
      implicitTags: { tags: [] },
      fallbackRouteParams: null,
      renderSignal: mockController.signal,
      controller: mockController,
      stagedRendering: null,
      cacheSignal: null,
      dynamicTracking: null,
      revalidate: 60,
      expire: 300,
      stale: 600,
      tags: [],
      resumeDataCache: null,
      hmrRefreshHash: undefined,
      varyParamsAccumulator: null,
      prerenderDataTracking: null,
      isFallbackUpgradeable: false,
    }

    releasePrerenderStore(store)

    expect(errorWithStack.stack).toBe('Error: Render aborted')
  })
})

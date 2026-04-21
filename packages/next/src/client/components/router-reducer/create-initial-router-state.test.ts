import type { InitialRSCPayload } from '../../../shared/lib/app-router-types'
import { createInitialRouterState } from './create-initial-router-state'

const mockGetFlightDataPartsFromPath = jest.fn()
const mockCreateInitialCacheNodeForHydration = jest.fn()
const mockConvertRootFlightRouterStateToRouteTree = jest.fn()
const mockDiscoverKnownRoute = jest.fn()
const mockProcessRuntimePrefetchStream = jest.fn()
const mockWriteDynamicRenderResponseIntoCache = jest.fn()

jest.mock('../../flight-data-helpers', () => ({
  getFlightDataPartsFromPath: (...args: Array<unknown>) =>
    mockGetFlightDataPartsFromPath(...args),
}))

jest.mock('./ppr-navigations', () => ({
  createInitialCacheNodeForHydration: (...args: Array<unknown>) =>
    mockCreateInitialCacheNodeForHydration(...args),
}))

jest.mock('../segment-cache/cache', () => ({
  convertRootFlightRouterStateToRouteTree: (...args: Array<unknown>) =>
    mockConvertRootFlightRouterStateToRouteTree(...args),
  getStaleTimeMs: jest.fn((staleTime: number) => staleTime),
  getStaleAt: jest.fn(),
  processRuntimePrefetchStream: (...args: Array<unknown>) =>
    mockProcessRuntimePrefetchStream(...args),
  writeDynamicRenderResponseIntoCache: (...args: Array<unknown>) =>
    mockWriteDynamicRenderResponseIntoCache(...args),
  writeStaticStageResponseIntoCache: jest.fn(),
}))

jest.mock('../segment-cache/optimistic-routes', () => ({
  discoverKnownRoute: (...args: Array<unknown>) =>
    mockDiscoverKnownRoute(...args),
}))

describe('createInitialRouterState output export fallback', () => {
  const discoveredRouteEntry = {
    outputExportFallbackBasePath: null as string | null,
  }

  const initialRSCPayload: InitialRSCPayload = {
    c: ['', 'hydrated', 'first'],
    q: '',
    i: false,
    f: [[] as any],
    m: new Set(),
    G: [(() => null) as any, undefined],
    S: false,
    h: null,
  }

  beforeEach(() => {
    mockGetFlightDataPartsFromPath.mockReset()
    mockCreateInitialCacheNodeForHydration.mockReset()
    mockConvertRootFlightRouterStateToRouteTree.mockReset()
    mockDiscoverKnownRoute.mockReset()
    mockProcessRuntimePrefetchStream.mockReset()
    mockWriteDynamicRenderResponseIntoCache.mockReset()

    discoveredRouteEntry.outputExportFallbackBasePath = null

    mockGetFlightDataPartsFromPath.mockReturnValue({
      tree: ['', {}],
      seedData: null,
      head: null,
    })
    mockCreateInitialCacheNodeForHydration.mockReturnValue({
      rsc: null,
      prefetchRsc: null,
      prefetchHead: null,
      head: null,
      slots: null,
      scrollRef: null,
    })
    mockConvertRootFlightRouterStateToRouteTree.mockImplementation(
      (_tree, _renderedSearch, acc) => {
        acc.metadataVaryPath = '__PAGE__'
        return { path: '/hydrated/[thread]' }
      }
    )
    mockDiscoverKnownRoute.mockReturnValue(discoveredRouteEntry)
  })

  it('stores the learned fallback artifact base path on the hydrated route entry', () => {
    createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload,
      location: new URL(
        'https://example.com/hydrated/first/'
      ) as unknown as Location,
      outputExportFallbackBasePath: '/hydrated/__fallback',
    })

    expect(discoveredRouteEntry.outputExportFallbackBasePath).toBe(
      '/hydrated/__fallback'
    )
  })

  it('passes the learned fallback artifact base path into runtime-prefetch cache writes', async () => {
    const processedNavigationSeed = {
      renderedSearch: '',
      routeTree: { path: '/hydrated/[thread]' },
      metadataVaryPath: null,
      data: null,
      head: null,
      dynamicStaleAt: Date.now() + 30_000,
      outputExportFallbackBasePath: null as string | null,
    }

    mockProcessRuntimePrefetchStream.mockResolvedValue({
      flightDatas: [],
      navigationSeed: processedNavigationSeed,
      buildId: undefined,
      isResponsePartial: false,
      headVaryParams: null,
      staleAt: Date.now() + 30_000,
    })

    createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: {
        ...initialRSCPayload,
        p: new ReadableStream<Uint8Array>(),
      },
      location: new URL(
        'https://example.com/hydrated/first/'
      ) as unknown as Location,
      outputExportFallbackBasePath: '/hydrated/__fallback',
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(processedNavigationSeed.outputExportFallbackBasePath).toBe(
      '/hydrated/__fallback'
    )
    expect(mockWriteDynamicRenderResponseIntoCache).toHaveBeenCalledWith(
      expect.any(Number),
      expect.anything(),
      expect.any(Array),
      undefined,
      false,
      null,
      expect.any(Number),
      expect.objectContaining({
        outputExportFallbackBasePath: '/hydrated/__fallback',
      }),
      null
    )
  })
})

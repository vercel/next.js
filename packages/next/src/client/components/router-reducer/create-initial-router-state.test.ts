import type { InitialRSCPayload } from '../../../shared/lib/app-router-types'
import { createInitialRouterState } from './create-initial-router-state'

const mockGetFlightDataPartsFromPath = jest.fn()
const mockCreateInitialCacheNodeForHydration = jest.fn()
const mockConvertRootFlightRouterStateToRouteTree = jest.fn()
const mockDiscoverKnownRoute = jest.fn()

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
  processRuntimePrefetchStream: jest.fn(),
  writeDynamicRenderResponseIntoCache: jest.fn(),
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
      location: new URL('https://example.com/hydrated/first/') as Location,
      outputExportFallbackBasePath: '/hydrated/__fallback',
    })

    expect(discoveredRouteEntry.outputExportFallbackBasePath).toBe(
      '/hydrated/__fallback'
    )
  })
})

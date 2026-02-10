import type {
  DynamicPrerenderManifestRouteRuntime,
  PrerenderManifestRuntime,
  PrerenderManifestRouteRuntime,
} from '../../../build'
import { RenderingMode } from '../../../build/rendering-mode'
import { SharedCacheControls } from './shared-cache-controls.external'

describe('SharedCacheControls', () => {
  let sharedCacheControls: SharedCacheControls
  let prerenderManifest: PrerenderManifestRuntime

  beforeEach(() => {
    prerenderManifest = {
      version: 4,
      routes: {
        '/route1': {
          initialRevalidateSeconds: 10,
          initialExpireSeconds: undefined,
          prefetchDataRoute: null,
          renderingMode: RenderingMode.STATIC,
        } satisfies PrerenderManifestRouteRuntime,
        '/route2': {
          initialRevalidateSeconds: 20,
          initialExpireSeconds: 40,
          prefetchDataRoute: null,
          renderingMode: RenderingMode.STATIC,
        } satisfies PrerenderManifestRouteRuntime,
      },
      dynamicRoutes: {
        '/route4': {
          fallbackRevalidate: 30,
          fallbackExpire: 50,
          fallback: true,
          fallbackRootParams: undefined,
          fallbackSourceRoute: undefined,
          fallbackRouteParams: undefined,
          renderingMode: RenderingMode.PARTIALLY_STATIC,
        } satisfies DynamicPrerenderManifestRouteRuntime,
      },
      notFoundRoutes: [],
    }
    sharedCacheControls = new SharedCacheControls(prerenderManifest)
  })

  afterEach(() => {
    sharedCacheControls.clear()
  })

  it('should get cache control from in-memory cache', () => {
    sharedCacheControls.set('/route1', { revalidate: 15, expire: undefined })
    const cacheControl = sharedCacheControls.get('/route1')
    expect(cacheControl).toEqual({ revalidate: 15 })
  })

  it('should get cache control from prerender manifest if not in cache', () => {
    const cacheControl = sharedCacheControls.get('/route2')
    expect(cacheControl).toEqual({ revalidate: 20, expire: 40 })
  })

  it('should return undefined if cache control not found', () => {
    const cacheControl = sharedCacheControls.get('/route3')
    expect(cacheControl).toBeUndefined()
  })

  it('should set cache control in cache', () => {
    sharedCacheControls.set('/route3', { revalidate: 30, expire: undefined })
    const cacheControl = sharedCacheControls.get('/route3')
    expect(cacheControl).toEqual({ revalidate: 30 })
  })

  it('should clear the in-memory cache', () => {
    sharedCacheControls.set('/route3', { revalidate: 30, expire: undefined })
    sharedCacheControls.clear()
    const cacheControl = sharedCacheControls.get('/route3')
    expect(cacheControl).toBeUndefined()
  })

  it('should get cache control from prerender manifest for dynamic route with fallback', () => {
    const cacheControl = sharedCacheControls.get('/route4')
    expect(cacheControl).toEqual({ revalidate: 30, expire: 50 })
  })
})

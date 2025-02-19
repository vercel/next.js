import type { PrerenderManifestRoute } from '../../../build'
import { RenderingMode } from '../../../build/rendering-mode'
import { SharedCacheControls } from './shared-cache-controls'

describe('SharedCacheControls', () => {
  let sharedCacheControls: SharedCacheControls
  let prerenderManifest

  beforeEach(() => {
    prerenderManifest = {
      routes: {
        '/route1': {
          initialRevalidateSeconds: 10,
          initialExpireSeconds: undefined,
          dataRoute: null,
          srcRoute: null,
          prefetchDataRoute: null,
          experimentalPPR: undefined,
          renderingMode: RenderingMode.STATIC,
          allowHeader: [],
        } satisfies PrerenderManifestRoute,
        '/route2': {
          initialRevalidateSeconds: 20,
          initialExpireSeconds: 40,
          dataRoute: null,
          srcRoute: null,
          prefetchDataRoute: null,
          experimentalPPR: undefined,
          renderingMode: RenderingMode.STATIC,
          allowHeader: [],
        } satisfies PrerenderManifestRoute,
      },
      dynamicRoutes: {},
    }
    sharedCacheControls = new SharedCacheControls(prerenderManifest)
  })

  afterEach(() => {
    sharedCacheControls.clear()
  })

  it('should get cache control from in-memory cache', () => {
    sharedCacheControls.set('/route1', { revalidate: 15 })
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
    sharedCacheControls.set('/route3', { revalidate: 30 })
    const cacheControl = sharedCacheControls.get('/route3')
    expect(cacheControl).toEqual({ revalidate: 30 })
  })

  it('should clear the in-memory cache', () => {
    sharedCacheControls.set('/route3', { revalidate: 30 })
    sharedCacheControls.clear()
    const cacheControl = sharedCacheControls.get('/route3')
    expect(cacheControl).toBeUndefined()
  })
})

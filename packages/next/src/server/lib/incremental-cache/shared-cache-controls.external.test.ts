import type {
  DynamicPrerenderManifestRoute,
  PrerenderManifestRoute,
  PrerenderManifest,
} from '../../../build'
import { RenderingMode } from '../../../build/rendering-mode'
import { SharedCacheControls } from './shared-cache-controls.external'
import { getRouteCacheKey } from '../route-cache-key'
import { RouteKind } from '../../route-kind'
import type { Page, Route } from '../../../shared/lib/route-types'
import type { ResponseCacheOwner } from '../route-cache-key'

const owner: ResponseCacheOwner = {
  kind: RouteKind.PAGES,
  sourceRoute: '/[id]' as Route,
}
const other: ResponseCacheOwner = {
  kind: RouteKind.PAGES,
  sourceRoute: '/[...slug]' as Route,
}
const appRoute = (sourceRoute: Page): ResponseCacheOwner => ({
  kind: RouteKind.APP_ROUTE,
  sourceRoute,
})

describe('SharedCacheControls', () => {
  let sharedCacheControls: SharedCacheControls
  let prerenderManifest: Pick<PrerenderManifest, 'routes' | 'dynamicRoutes'>

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
      } as PrerenderManifest['routes'],
      dynamicRoutes: {
        '/route4': {
          fallbackRevalidate: 30,
          fallbackExpire: 50,
          fallback: true,
          fallbackRootParams: undefined,
          fallbackSourceRoute: undefined,
          fallbackRouteParams: undefined,
          dataRoute: null,
          dataRouteRegex: null,
          prefetchDataRoute: null,
          prefetchDataRouteRegex: null,
          routeRegex: '',
          experimentalPPR: undefined,
          renderingMode: RenderingMode.PARTIALLY_STATIC,
          allowHeader: [],
        } satisfies DynamicPrerenderManifestRoute,
      } as PrerenderManifest['dynamicRoutes'],
    }
    sharedCacheControls = new SharedCacheControls(prerenderManifest)
  })

  afterEach(() => {
    sharedCacheControls.clear()
  })

  it('rejects cache-control reads without a source route', () => {
    expect(() => {
      // @ts-expect-error cache-control lookups require a source route
      sharedCacheControls.get('/route2')
    }).toThrow('Response cache requires a source route')
  })

  it('should get cache control from in-memory cache', () => {
    sharedCacheControls.set(
      getRouteCacheKey('/route1' as Route, appRoute('/route1' as Page)),
      {
        revalidate: 15,
        expire: undefined,
      }
    )
    const cacheControl = sharedCacheControls.get(
      '/route1' as Route,
      appRoute('/route1' as Page)
    )
    expect(cacheControl).toEqual({ revalidate: 15 })
  })

  it('should get cache control from prerender manifest if not in cache', () => {
    const cacheControl = sharedCacheControls.get(
      '/route2' as Route,
      appRoute('/route2' as Page)
    )
    expect(cacheControl).toEqual({ revalidate: 20, expire: 40 })
  })

  it('should return undefined if cache control not found', () => {
    const cacheControl = sharedCacheControls.get(
      '/route3' as Route,
      appRoute('/route3' as Page)
    )
    expect(cacheControl).toBeUndefined()
  })

  it('should set cache control in cache', () => {
    sharedCacheControls.set(
      getRouteCacheKey('/route3' as Route, appRoute('/route3' as Page)),
      {
        revalidate: 30,
        expire: undefined,
      }
    )
    const cacheControl = sharedCacheControls.get(
      '/route3' as Route,
      appRoute('/route3' as Page)
    )
    expect(cacheControl).toEqual({ revalidate: 30 })
  })

  it('should clear the in-memory cache', () => {
    sharedCacheControls.set(
      getRouteCacheKey('/route3' as Route, appRoute('/route3' as Page)),
      {
        revalidate: 30,
        expire: undefined,
      }
    )
    sharedCacheControls.clear()
    const cacheControl = sharedCacheControls.get(
      '/route3' as Route,
      appRoute('/route3' as Page)
    )
    expect(cacheControl).toBeUndefined()
  })

  it('should get cache control from prerender manifest for dynamic route with fallback', () => {
    const cacheControl = sharedCacheControls.get(
      '/route4' as Route,
      appRoute('/route4' as Page)
    )
    expect(cacheControl).toEqual({ revalidate: 30, expire: 50 })
  })
  it('uses build-time metadata only for its recorded owner', () => {
    prerenderManifest.routes['/route2' as Route].srcRoute = owner.sourceRoute
    prerenderManifest.routes['/route2' as Route].dataRoute =
      '/_next/data/build/route2.json' as Route
    expect(sharedCacheControls.get('/route2' as Route, owner)).toEqual({
      revalidate: 20,
      expire: 40,
    })
    expect(sharedCacheControls.get('/route2' as Route, other)).toBeUndefined()
  })

  it("does not borrow a static route's metadata for a dynamic response", () => {
    prerenderManifest.routes['/route2' as Route].dataRoute =
      '/_next/data/build/route2.json' as Route
    expect(sharedCacheControls.get('/route2' as Route, owner)).toBeUndefined()
  })

  it('keeps runtime lifetime overrides separate from other owners and seeds', () => {
    prerenderManifest.routes['/route2' as Route].srcRoute = owner.sourceRoute
    prerenderManifest.routes['/route2' as Route].dataRoute =
      '/_next/data/build/route2.json' as Route
    sharedCacheControls.set(getRouteCacheKey('/route2' as Route, other), {
      revalidate: 1,
      expire: 2,
    })
    expect(sharedCacheControls.get('/route2' as Route, owner)).toEqual({
      revalidate: 20,
      expire: 40,
    })
    expect(sharedCacheControls.get('/route2' as Route, other)).toEqual({
      revalidate: 1,
      expire: 2,
    })
  })

  it('uses locale-prefixed static metadata only for its source page', () => {
    prerenderManifest.routes['/fr/route2' as Route] = {
      ...prerenderManifest.routes['/route2' as Route],
      dataRoute: '/_next/data/build/fr/route2.json' as Route,
    }
    sharedCacheControls = new SharedCacheControls(prerenderManifest, [
      'en',
      'fr',
    ])
    expect(
      sharedCacheControls.get('/fr/route2' as Route, {
        kind: RouteKind.PAGES,
        sourceRoute: '/route2' as Route,
      })
    ).toEqual({ revalidate: 20, expire: 40 })
    expect(
      sharedCacheControls.get('/fr/route2' as Route, other)
    ).toBeUndefined()
  })

  it('uses the source pattern for locale-prefixed fallback metadata', () => {
    prerenderManifest.dynamicRoutes['/route4' as Route].dataRoute =
      '/_next/data/build/route4.json' as Route
    sharedCacheControls = new SharedCacheControls(prerenderManifest, [
      'en',
      'fr',
    ])
    expect(
      sharedCacheControls.get('/fr/route4' as Route, {
        kind: RouteKind.PAGES,
        sourceRoute: '/route4' as Route,
      })
    ).toEqual({ revalidate: 30, expire: 50 })
    expect(
      sharedCacheControls.get('/fr/route4' as Route, other)
    ).toBeUndefined()
  })

  it('keeps a partial fallback shell lifetime with its original source', () => {
    prerenderManifest.dynamicRoutes['/catalog/a/[item]' as Route] = {
      ...prerenderManifest.dynamicRoutes['/route4' as Route],
      dataRoute: '/catalog/a/[item].rsc' as Route,
      fallbackSourceRoute: '/catalog/[category]/[item]' as Route,
    }
    expect(
      sharedCacheControls.get('/catalog/a/[item]' as Route, {
        kind: RouteKind.APP_PAGE,
        sourceRoute: '/(group)/catalog/[category]/[item]/page' as Page,
      })
    ).toEqual({ revalidate: 30, expire: 50 })
    expect(
      sharedCacheControls.get('/catalog/a/[item]' as Route, {
        kind: RouteKind.APP_PAGE,
        sourceRoute: '/catalog/a/[item]/page' as Page,
      })
    ).toBeUndefined()
  })
})

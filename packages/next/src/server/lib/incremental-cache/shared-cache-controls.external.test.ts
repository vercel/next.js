import type {
  DynamicPrerenderManifestRoute,
  PrerenderManifestRoute,
  PrerenderManifest,
} from '../../../build'
import { RenderingMode } from '../../../build/rendering-mode'
import {
  ENTRY_OVERHEAD,
  SharedCacheControls,
} from './shared-cache-controls.external'
import { getRouteCacheKey } from '../route-cache-key'
import { RouteKind } from '../../route-kind'

const owner = { kind: RouteKind.PAGES, sourceRoute: '/[id]' }
const other = { kind: RouteKind.PAGES, sourceRoute: '/[...slug]' }
const appRoute = (sourceRoute: string) => ({
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
      },
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
      },
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
    sharedCacheControls.set(getRouteCacheKey('/route1', appRoute('/route1')), {
      revalidate: 15,
      expire: undefined,
    })
    const cacheControl = sharedCacheControls.get('/route1', appRoute('/route1'))
    expect(cacheControl).toEqual({ revalidate: 15 })
  })

  it('should get cache control from prerender manifest if not in cache', () => {
    const cacheControl = sharedCacheControls.get('/route2', appRoute('/route2'))
    expect(cacheControl).toEqual({ revalidate: 20, expire: 40 })
  })

  it('should return undefined if cache control not found', () => {
    const cacheControl = sharedCacheControls.get('/route3', appRoute('/route3'))
    expect(cacheControl).toBeUndefined()
  })

  it('should set cache control in cache', () => {
    sharedCacheControls.set(getRouteCacheKey('/route3', appRoute('/route3')), {
      revalidate: 30,
      expire: undefined,
    })
    const cacheControl = sharedCacheControls.get('/route3', appRoute('/route3'))
    expect(cacheControl).toEqual({ revalidate: 30 })
  })

  it('should clear the in-memory cache', () => {
    sharedCacheControls.set(getRouteCacheKey('/route3', appRoute('/route3')), {
      revalidate: 30,
      expire: undefined,
    })
    sharedCacheControls.clear()
    const cacheControl = sharedCacheControls.get('/route3', appRoute('/route3'))
    expect(cacheControl).toBeUndefined()
  })

  it('should get cache control from prerender manifest for dynamic route with fallback', () => {
    const cacheControl = sharedCacheControls.get('/route4', appRoute('/route4'))
    expect(cacheControl).toEqual({ revalidate: 30, expire: 50 })
  })
  it('uses build-time metadata only for its recorded owner', () => {
    prerenderManifest.routes['/route2'].srcRoute = owner.sourceRoute
    prerenderManifest.routes['/route2'].dataRoute =
      '/_next/data/build/route2.json'
    expect(sharedCacheControls.get('/route2', owner)).toEqual({
      revalidate: 20,
      expire: 40,
    })
    expect(sharedCacheControls.get('/route2', other)).toBeUndefined()
  })

  it("does not borrow a static route's metadata for a dynamic response", () => {
    prerenderManifest.routes['/route2'].dataRoute =
      '/_next/data/build/route2.json'
    expect(sharedCacheControls.get('/route2', owner)).toBeUndefined()
  })

  it('keeps runtime lifetime overrides separate from other owners and seeds', () => {
    prerenderManifest.routes['/route2'].srcRoute = owner.sourceRoute
    prerenderManifest.routes['/route2'].dataRoute =
      '/_next/data/build/route2.json'
    sharedCacheControls.set(getRouteCacheKey('/route2', other), {
      revalidate: 1,
      expire: 2,
    })
    expect(sharedCacheControls.get('/route2', owner)).toEqual({
      revalidate: 20,
      expire: 40,
    })
    expect(sharedCacheControls.get('/route2', other)).toEqual({
      revalidate: 1,
      expire: 2,
    })
  })

  it('uses locale-prefixed static metadata only for its source page', () => {
    prerenderManifest.routes['/fr/route2'] = {
      ...prerenderManifest.routes['/route2'],
      dataRoute: '/_next/data/build/fr/route2.json',
    }
    sharedCacheControls = new SharedCacheControls(prerenderManifest, [
      'en',
      'fr',
    ])
    expect(
      sharedCacheControls.get('/fr/route2', {
        kind: RouteKind.PAGES,
        sourceRoute: '/route2',
      })
    ).toEqual({ revalidate: 20, expire: 40 })
    expect(sharedCacheControls.get('/fr/route2', other)).toBeUndefined()
  })

  it('uses the source pattern for locale-prefixed fallback metadata', () => {
    prerenderManifest.dynamicRoutes['/route4'].dataRoute =
      '/_next/data/build/route4.json'
    sharedCacheControls = new SharedCacheControls(prerenderManifest, [
      'en',
      'fr',
    ])
    expect(
      sharedCacheControls.get('/fr/route4', {
        kind: RouteKind.PAGES,
        sourceRoute: '/route4',
      })
    ).toEqual({ revalidate: 30, expire: 50 })
    expect(sharedCacheControls.get('/fr/route4', other)).toBeUndefined()
  })

  it('keeps a partial fallback shell lifetime with its original source', () => {
    prerenderManifest.dynamicRoutes['/catalog/a/[item]'] = {
      ...prerenderManifest.dynamicRoutes['/route4'],
      dataRoute: '/catalog/a/[item].rsc',
      fallbackSourceRoute: '/catalog/[category]/[item]',
    }
    expect(
      sharedCacheControls.get('/catalog/a/[item]', {
        kind: RouteKind.APP_PAGE,
        sourceRoute: '/(group)/catalog/[category]/[item]/page',
      })
    ).toEqual({ revalidate: 30, expire: 50 })
    expect(
      sharedCacheControls.get('/catalog/a/[item]', {
        kind: RouteKind.APP_PAGE,
        sourceRoute: '/catalog/a/[item]/page',
      })
    ).toBeUndefined()
  })

  describe('size budget', () => {
    const routeKey = (route: string) => getRouteCacheKey(route, appRoute(route))
    const entrySize = (route: string) => ENTRY_OVERHEAD + routeKey(route).length
    const originalMaxBytes = process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES

    beforeEach(() => {
      // Each entry counts a fixed overhead plus the full source-scoped key,
      // so this fits three of the four character pathnames below.
      process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES = String(
        3 * entrySize('/r/1')
      )
      sharedCacheControls.clear()
      jest.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      if (originalMaxBytes === undefined) {
        delete process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES
      } else {
        process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES = originalMaxBytes
      }
      sharedCacheControls.clear()
      jest.restoreAllMocks()
    })

    it('should evict the least recently used routes', () => {
      for (const route of ['/r/1', '/r/2', '/r/3', '/r/4']) {
        sharedCacheControls.set(routeKey(route), {
          revalidate: 60,
          expire: undefined,
        })
      }

      expect(sharedCacheControls.get('/r/1', appRoute('/r/1'))).toBeUndefined()
      expect(sharedCacheControls.get('/r/2', appRoute('/r/2'))).toEqual({
        revalidate: 60,
      })
      expect(sharedCacheControls.get('/r/3', appRoute('/r/3'))).toEqual({
        revalidate: 60,
      })
      expect(sharedCacheControls.get('/r/4', appRoute('/r/4'))).toEqual({
        revalidate: 60,
      })
    })

    it('should warn when routes are evicted', () => {
      for (const route of ['/r/1', '/r/2', '/r/3']) {
        sharedCacheControls.set(routeKey(route), {
          revalidate: 60,
          expire: undefined,
        })
      }
      expect(console.warn).not.toHaveBeenCalled()

      sharedCacheControls.set(routeKey('/r/4'), {
        revalidate: 60,
        expire: undefined,
      })
      sharedCacheControls.set(routeKey('/r/5'), {
        revalidate: 60,
        expire: undefined,
      })
      expect(console.warn).toHaveBeenCalledTimes(1)
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES')
      )
    })

    it('should keep routes that were read recently', () => {
      for (const route of ['/r/1', '/r/2', '/r/3']) {
        sharedCacheControls.set(routeKey(route), {
          revalidate: 60,
          expire: undefined,
        })
      }
      sharedCacheControls.get('/r/1', appRoute('/r/1'))
      sharedCacheControls.set(routeKey('/r/4'), {
        revalidate: 60,
        expire: undefined,
      })

      expect(sharedCacheControls.get('/r/1', appRoute('/r/1'))).toEqual({
        revalidate: 60,
      })
      expect(sharedCacheControls.get('/r/2', appRoute('/r/2'))).toBeUndefined()
    })

    it('should fall back to the prerender manifest for evicted routes', () => {
      sharedCacheControls.set(routeKey('/route1'), {
        revalidate: 15,
        expire: undefined,
      })
      for (const route of ['/r/1', '/r/2', '/r/3']) {
        sharedCacheControls.set(routeKey(route), {
          revalidate: 60,
          expire: undefined,
        })
      }

      expect(sharedCacheControls.get('/route1', appRoute('/route1'))).toEqual({
        revalidate: 10,
      })
    })

    it('should count the route length towards the budget', () => {
      const longRoute = '/' + 'a'.repeat(2 * ENTRY_OVERHEAD)
      sharedCacheControls.set(routeKey('/r/1'), {
        revalidate: 60,
        expire: undefined,
      })
      sharedCacheControls.set(routeKey(longRoute), {
        revalidate: 60,
        expire: undefined,
      })

      expect(sharedCacheControls.get('/r/1', appRoute('/r/1'))).toBeUndefined()
      expect(sharedCacheControls.get(longRoute, appRoute(longRoute))).toEqual({
        revalidate: 60,
      })
    })

    it('should skip routes larger than the whole budget and warn once', () => {
      // Fits one four character route, but not the longer route.
      process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES = String(
        entrySize('/r/1')
      )
      sharedCacheControls.clear()
      const longRoute = '/r/10'

      sharedCacheControls.set(routeKey('/r/1'), {
        revalidate: 60,
        expire: undefined,
      })
      for (let i = 0; i < 3; i++) {
        sharedCacheControls.set(routeKey(longRoute), {
          revalidate: 60,
          expire: undefined,
        })
      }

      expect(
        sharedCacheControls.get(longRoute, appRoute(longRoute))
      ).toBeUndefined()
      // The skipped writes don't evict the routes that fit.
      expect(sharedCacheControls.get('/r/1', appRoute('/r/1'))).toEqual({
        revalidate: 60,
      })
      expect(console.warn).toHaveBeenCalledTimes(1)
      const [message] = jest.mocked(console.warn).mock.calls[0]
      expect(message).toContain('NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES')
      expect(message).toContain(`${entrySize('/r/1')} bytes`)
      expect(message).not.toContain('least recently used')
    })

    it('should still warn about evictions after skipping a route larger than the budget', () => {
      process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES = String(
        entrySize('/r/1')
      )
      sharedCacheControls.clear()

      sharedCacheControls.set(routeKey('/r/10'), {
        revalidate: 60,
        expire: undefined,
      })
      sharedCacheControls.set(routeKey('/r/1'), {
        revalidate: 60,
        expire: undefined,
      })
      sharedCacheControls.set(routeKey('/r/2'), {
        revalidate: 60,
        expire: undefined,
      })

      expect(sharedCacheControls.get('/r/1', appRoute('/r/1'))).toBeUndefined()
      expect(sharedCacheControls.get('/r/2', appRoute('/r/2'))).toEqual({
        revalidate: 60,
      })
      expect(console.warn).toHaveBeenCalledTimes(2)
      expect(console.warn).toHaveBeenLastCalledWith(
        expect.stringContaining('least recently used')
      )
    })

    it.each(['32MiB', '1e6', '-1', 'abc', '0'])(
      'should use the default budget when the configured budget is %p',
      (maxBytes) => {
        process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES = maxBytes
        sharedCacheControls.clear()
        const routes = Array.from(
          { length: 10 },
          (_, i) => `/r/${i}/` + 'a'.repeat(1000)
        )

        for (const route of routes) {
          sharedCacheControls.set(routeKey(route), {
            revalidate: 60,
            expire: undefined,
          })
        }

        for (const route of routes) {
          expect(sharedCacheControls.get(route, appRoute(route))).toEqual({
            revalidate: 60,
          })
        }
        expect(console.warn).not.toHaveBeenCalled()
      }
    )
    it('keeps owner isolation when an evicted entry falls back to the manifest', () => {
      prerenderManifest.routes['/route2'].srcRoute = owner.sourceRoute
      prerenderManifest.routes['/route2'].dataRoute =
        '/_next/data/build/route2.json'
      process.env.NEXT_PRIVATE_CACHE_CONTROLS_MAX_BYTES = String(
        ENTRY_OVERHEAD + getRouteCacheKey('/route2', owner).length
      )
      sharedCacheControls.clear()
      sharedCacheControls.set(getRouteCacheKey('/route2', owner), {
        revalidate: 15,
        expire: undefined,
      })
      sharedCacheControls.set(getRouteCacheKey('/route2', other), {
        revalidate: 60,
        expire: undefined,
      })

      expect(sharedCacheControls.get('/route2', owner)).toEqual({
        revalidate: 20,
        expire: 40,
      })
      expect(sharedCacheControls.get('/route2', other)).toEqual({
        revalidate: 60,
      })
    })
  })
})

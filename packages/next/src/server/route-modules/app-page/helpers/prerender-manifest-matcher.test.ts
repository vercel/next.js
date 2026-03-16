import { PrerenderManifestMatcher } from './prerender-manifest-matcher'
import type {
  PrerenderManifest,
  DynamicPrerenderManifestRoute,
} from '../../../../build'
import { RenderingMode } from '../../../../build/rendering-mode'

// Helper function to create a mock PrerenderManifest
function createMockPrerenderManifest(
  dynamicRoutes: Record<string, DynamicPrerenderManifestRoute> = {}
): PrerenderManifest {
  return {
    version: 4,
    routes: {},
    dynamicRoutes,
    notFoundRoutes: [],
    preview: {
      previewModeId: 'test-preview-id',
      previewModeEncryptionKey: 'test-encryption-key',
      previewModeSigningKey: 'test-signing-key',
    },
  }
}

// Helper function to create a mock DynamicPrerenderManifestRoute
function createMockDynamicRoute(
  overrides: Partial<DynamicPrerenderManifestRoute> = {}
): DynamicPrerenderManifestRoute {
  return {
    dataRoute: null,
    dataRouteRegex: null,
    fallback: null,
    fallbackRevalidate: false,
    fallbackExpire: undefined,
    fallbackHeaders: undefined,
    fallbackStatus: undefined,
    fallbackRouteParams: undefined,
    fallbackRootParams: undefined,
    fallbackSourceRoute: undefined,
    prefetchDataRoute: undefined,
    prefetchDataRouteRegex: undefined,
    routeRegex: '^/[^/]+(?:/[^/]+)?/?$',
    experimentalPPR: undefined,
    renderingMode: RenderingMode.STATIC,
    allowHeader: ['host'],
    ...overrides,
  }
}

describe('PrerenderManifestMatcher', () => {
  describe('match', () => {
    describe('successful matches', () => {
      it('should respect route specificity order', () => {
        const specificRoute = createMockDynamicRoute({
          fallbackSourceRoute: '/[category]/[id]',
        })

        const catchAllRoute = createMockDynamicRoute({
          fallbackSourceRoute: '/[category]/[id]',
        })

        // Order matters - more specific routes should come first
        const manifest = createMockPrerenderManifest({
          '/products/[id]': specificRoute,
          '/[category]/[id]': catchAllRoute,
        })

        const matcher = new PrerenderManifestMatcher(
          '/[category]/[id]',
          manifest
        )

        const result = matcher.match('/products/123')

        expect(result).toEqual({
          source: '/products/[id]',
          route: specificRoute,
        })
      })

      it('should handle when the fallbackSourceRoute is not set', () => {
        const route = createMockDynamicRoute({
          fallbackSourceRoute: undefined,
        })

        const manifest = createMockPrerenderManifest({
          '/products/[id]': route,
        })

        const matcher = new PrerenderManifestMatcher('/products/[id]', manifest)

        const result = matcher.match('/products/123')

        expect(result).toEqual({
          source: '/products/[id]',
          route,
        })
      })

      it('should match unknown root branches against the generic source shell', () => {
        const generatedRootRoute = createMockDynamicRoute({
          fallbackSourceRoute: '/root-gsp/[lang]/[slug]',
          routeRegex: '^/root-gsp/en/([^/]+?)(?:/)?$',
          fallbackRootParams: [],
          fallbackRouteParams: [
            {
              paramName: 'slug',
              paramType: 'dynamic',
            },
          ],
        })

        const genericRootRoute = createMockDynamicRoute({
          fallbackSourceRoute: '/root-gsp/[lang]/[slug]',
          routeRegex: '^/root-gsp/([^/]+?)/([^/]+?)(?:/)?$',
          fallbackRootParams: ['lang'],
          fallbackRouteParams: [
            {
              paramName: 'lang',
              paramType: 'dynamic',
            },
            {
              paramName: 'slug',
              paramType: 'dynamic',
            },
          ],
        })

        const manifest = createMockPrerenderManifest({
          '/root-gsp/en/[slug]': generatedRootRoute,
          '/root-gsp/[lang]/[slug]': genericRootRoute,
        })

        const matcher = new PrerenderManifestMatcher(
          '/root-gsp/[lang]/[slug]',
          manifest
        )

        expect(matcher.match('/root-gsp/en/two')).toEqual({
          source: '/root-gsp/en/[slug]',
          route: generatedRootRoute,
        })
        expect(matcher.match('/root-gsp/fr/two')).toEqual({
          source: '/root-gsp/[lang]/[slug]',
          route: genericRootRoute,
        })
      })
    })

    describe('no match scenarios', () => {
      it('should return null when no matching route is found', () => {
        const route = createMockDynamicRoute({
          fallbackSourceRoute: '/[category]/[id]',
        })

        const manifest = createMockPrerenderManifest({
          '/products/[id]': route,
        })

        const matcher = new PrerenderManifestMatcher(
          '/[category]/[id]',
          manifest
        )

        const result = matcher.match('/non-matching-path')

        expect(result).toBe(null)
      })

      it('should return null when no routes match the fallback source route', () => {
        const route = createMockDynamicRoute({
          fallbackSourceRoute: '/products/[id]',
        })

        const manifest = createMockPrerenderManifest({
          '/products/[id]': route,
        })

        const matcher = new PrerenderManifestMatcher(
          '/[category]/[id]',
          manifest
        )

        const result = matcher.match('/products/123')

        expect(result).toBe(null)
      })
    })
  })
})

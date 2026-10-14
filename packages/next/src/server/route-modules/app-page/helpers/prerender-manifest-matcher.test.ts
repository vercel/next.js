import { PrerenderManifestMatcher } from './prerender-manifest-matcher'
import type {
  PrerenderManifest,
  DynamicPrerenderManifestRoute,
} from '../../../../build'
import { RenderingMode } from '../../../../build/rendering-mode'
import { createRoute } from '../../../../shared/lib/route-types'

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
          fallbackSourceRoute: createRoute('/[category]/[id]'),
        })

        const catchAllRoute = createMockDynamicRoute({
          fallbackSourceRoute: createRoute('/[category]/[id]'),
        })

        // Order matters - more specific routes should come first
        const manifest = createMockPrerenderManifest({
          '/products/[id]': specificRoute,
          '/[category]/[id]': catchAllRoute,
        })

        const matcher = new PrerenderManifestMatcher(
          createRoute('/[category]/[id]'),
          manifest
        )

        const result = matcher.match(createRoute('/products/123'))

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

        const matcher = new PrerenderManifestMatcher(
          createRoute('/products/[id]'),
          manifest
        )

        const result = matcher.match(createRoute('/products/123'))

        expect(result).toEqual({
          source: '/products/[id]',
          route,
        })
      })

      it('should match unknown root branches against the generic source shell', () => {
        const generatedRootRoute = createMockDynamicRoute({
          fallbackSourceRoute: createRoute('/root-gsp/[lang]/[slug]'),
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
          fallbackSourceRoute: createRoute('/root-gsp/[lang]/[slug]'),
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
          createRoute('/root-gsp/[lang]/[slug]'),
          manifest
        )

        expect(matcher.match(createRoute('/root-gsp/en/two'))).toEqual({
          source: '/root-gsp/en/[slug]',
          route: generatedRootRoute,
        })
        expect(matcher.match(createRoute('/root-gsp/fr/two'))).toEqual({
          source: '/root-gsp/[lang]/[slug]',
          route: genericRootRoute,
        })
      })

      it('should match a pathname that was already decoded for manifest lookup', () => {
        const route = createMockDynamicRoute({
          fallbackSourceRoute: createRoute('/open/[...slug]'),
        })

        const manifest = createMockPrerenderManifest({
          '/open/[...slug]': route,
        })

        const matcher = new PrerenderManifestMatcher(
          createRoute('/open/[...slug]'),
          manifest
        )

        expect(
          matcher.match(createRoute('/open/docs/space here/with%2Fslash/100%'))
        ).toEqual({
          source: '/open/[...slug]',
          route,
        })
      })
    })

    describe('no match scenarios', () => {
      it('should return null when no matching route is found', () => {
        const route = createMockDynamicRoute({
          fallbackSourceRoute: createRoute('/[category]/[id]'),
        })

        const manifest = createMockPrerenderManifest({
          '/products/[id]': route,
        })

        const matcher = new PrerenderManifestMatcher(
          createRoute('/[category]/[id]'),
          manifest
        )

        const result = matcher.match(createRoute('/non-matching-path'))

        expect(result).toBe(null)
      })

      it('should return null when no routes match the fallback source route', () => {
        const route = createMockDynamicRoute({
          fallbackSourceRoute: createRoute('/products/[id]'),
        })

        const manifest = createMockPrerenderManifest({
          '/products/[id]': route,
        })

        const matcher = new PrerenderManifestMatcher(
          createRoute('/[category]/[id]'),
          manifest
        )

        const result = matcher.match(createRoute('/products/123'))

        expect(result).toBe(null)
      })
    })
  })
})

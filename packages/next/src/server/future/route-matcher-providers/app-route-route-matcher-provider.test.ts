import { SERVER_DIRECTORY } from '../../../shared/lib/constants'
import type { AppRouteRouteDefinition } from '../route-definitions/app-route-route-definition'
import { RouteKind } from '../route-kind'
import { AppRouteRouteMatcherProvider } from './app-route-route-matcher-provider'
import type { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'

describe('AppRouteRouteMatcherProvider', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const provider = new AppRouteRouteMatcherProvider('<root>', loader)
    expect(await provider.matchers()).toEqual([])
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: AppRouteRouteDefinition
    }>([
      {
        manifest: {
          '/route': 'app/route.js',
        },
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/',
          filename: `<root>/${SERVER_DIRECTORY}/app/route.js`,
          page: '/route',
          bundlePath: 'app/route',
        },
      },
      {
        manifest: { '/users/[id]/route': 'app/users/[id]/route.js' },
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/users/[id]',
          filename: `<root>/${SERVER_DIRECTORY}/app/users/[id]/route.js`,
          page: '/users/[id]/route',
          bundlePath: 'app/users/[id]/route',
        },
      },
      {
        manifest: { '/users/route': 'app/users/route.js' },
        route: {
          kind: RouteKind.APP_ROUTE,
          pathname: '/users',
          filename: `<root>/${SERVER_DIRECTORY}/app/users/route.js`,
          page: '/users/route',
          bundlePath: 'app/users/route',
        },
      },
    ])(
      'returns the correct routes for $route.pathname',
      async ({ manifest, route }) => {
        const loader: ManifestLoader = {
          load: jest.fn(() => ({
            '/dashboard/users/[id]/page': 'app/dashboard/users/[id]/page.js',
            '/dashboard/users/page': 'app/dashboard/users/page.js',
            ...manifest,
          })),
        }
        const provider = new AppRouteRouteMatcherProvider('<root>', loader)
        const matchers = await provider.matchers()

        expect(matchers).toHaveLength(1)
        expect(matchers[0].definition).toEqual(route)
      }
    )
  })
})

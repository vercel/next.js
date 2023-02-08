import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { RouteKind } from '../route-kind'
import { AppRouteRouteMatcher } from './app-route-route-matcher'
import { RouteDefinition } from './route-matcher'

describe('AppRouteRouteMatcher', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const matcher = new AppRouteRouteMatcher('<root>', loader)
    expect(await matcher.routes()).toEqual([])
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: RouteDefinition<RouteKind.APP_ROUTE>
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
        const matcher = new AppRouteRouteMatcher('<root>', loader)
        const routes = await matcher.routes()

        expect(routes).toHaveLength(1)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})

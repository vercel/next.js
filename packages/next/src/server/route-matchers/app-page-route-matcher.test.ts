import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { RouteKind } from '../route-kind'
import { AppPageRouteMatcher } from './app-page-route-matcher'
import { RouteDefinition } from './route-matcher'

describe('AppPageRouteMatcher', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const matcher = new AppPageRouteMatcher('<root>', loader)
    expect(await matcher.routes()).toEqual([])
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: RouteDefinition<RouteKind.APP_PAGE>
    }>([
      {
        manifest: {
          '/page': 'app/page.js',
        },
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/',
          filename: `<root>/${SERVER_DIRECTORY}/app/page.js`,
          page: '/page',
          bundlePath: 'app/page',
        },
      },
      {
        manifest: {
          '/(marketing)/about/page': 'app/(marketing)/about/page.js',
        },
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/about',
          filename: `<root>/${SERVER_DIRECTORY}/app/(marketing)/about/page.js`,
          page: '/(marketing)/about/page',
          bundlePath: 'app/(marketing)/about/page',
        },
      },
      {
        manifest: {
          '/dashboard/users/[id]/page': 'app/dashboard/users/[id]/page.js',
        },
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/dashboard/users/[id]',
          filename: `<root>/${SERVER_DIRECTORY}/app/dashboard/users/[id]/page.js`,
          page: '/dashboard/users/[id]/page',
          bundlePath: 'app/dashboard/users/[id]/page',
        },
      },
      {
        manifest: { '/dashboard/users/page': 'app/dashboard/users/page.js' },
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/dashboard/users',
          filename: `<root>/${SERVER_DIRECTORY}/app/dashboard/users/page.js`,
          page: '/dashboard/users/page',
          bundlePath: 'app/dashboard/users/page',
        },
      },
    ])(
      'returns the correct routes for $route.pathname',
      async ({ manifest, route }) => {
        const loader: ManifestLoader = {
          load: jest.fn(() => ({
            '/users/[id]/route': 'app/users/[id]/route.js',
            '/users/route': 'app/users/route.js',
            ...manifest,
          })),
        }
        const matcher = new AppPageRouteMatcher('<root>', loader)
        const routes = await matcher.routes()

        expect(loader.load).toHaveBeenCalled()
        expect(routes).toHaveLength(1)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})

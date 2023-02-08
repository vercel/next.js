import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { RouteKind } from '../route-kind'
import { PagesAPIRouteMatcher } from './pages-api-route-matcher'
import { RouteDefinition } from './route-matcher'

describe('PagesAPIRouteMatcher', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const matcher = new PagesAPIRouteMatcher('<root>', loader)
    expect(await matcher.routes()).toEqual([])
    expect(loader.load).toBeCalledWith(PAGES_MANIFEST)
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: RouteDefinition<RouteKind.PAGES_API>
    }>([
      {
        manifest: { '/api/users/[id]': 'pages/api/users/[id].js' },
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api/users/[id]',
          filename: `<root>/${SERVER_DIRECTORY}/pages/api/users/[id].js`,
          page: '/api/users/[id]',
          bundlePath: 'pages/api/users/[id]',
        },
      },
      {
        manifest: { '/api/users': 'pages/api/users.js' },
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api/users',
          filename: `<root>/${SERVER_DIRECTORY}/pages/api/users.js`,
          page: '/api/users',
          bundlePath: 'pages/api/users',
        },
      },
      {
        manifest: { '/api': 'pages/api.js' },
        route: {
          kind: RouteKind.PAGES_API,
          pathname: '/api',
          filename: `<root>/${SERVER_DIRECTORY}/pages/api.js`,
          page: '/api',
          bundlePath: 'pages/api',
        },
      },
    ])(
      'returns the correct routes for $route.pathname',
      async ({ manifest, route }) => {
        const loader: ManifestLoader = {
          load: jest.fn(() => ({
            '/users/[id]': 'pages/users/[id].js',
            '/users': 'pages/users.js',
            ...manifest,
          })),
        }
        const matcher = new PagesAPIRouteMatcher('<root>', loader)
        const routes = await matcher.routes()

        expect(loader.load).toBeCalledWith(PAGES_MANIFEST)
        expect(routes).toHaveLength(1)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})

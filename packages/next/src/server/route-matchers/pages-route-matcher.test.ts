import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import { ManifestLoader } from '../manifest-loaders/manifest-loader'
import { RouteKind } from '../route-kind'
import { PagesRouteMatcher } from './pages-route-matcher'
import { RouteDefinition } from './route-matcher'

describe('PagesRouteMatcher', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const matcher = new PagesRouteMatcher('<root>', loader)
    expect(await matcher.routes()).toEqual([])
    expect(loader.load).toBeCalledWith(PAGES_MANIFEST)
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: RouteDefinition<RouteKind.PAGES>
    }>([
      {
        manifest: { '/users/[id]': 'pages/users/[id].js' },
        route: {
          kind: RouteKind.PAGES,
          pathname: '/users/[id]',
          filename: `<root>/${SERVER_DIRECTORY}/pages/users/[id].js`,
          page: '/users/[id]',
          bundlePath: 'pages/users/[id]',
        },
      },
      {
        manifest: { '/users': 'pages/users.js' },
        route: {
          kind: RouteKind.PAGES,
          pathname: '/users',
          filename: `<root>/${SERVER_DIRECTORY}/pages/users.js`,
          page: '/users',
          bundlePath: 'pages/users',
        },
      },
      {
        manifest: { '/': 'pages/index.js' },
        route: {
          kind: RouteKind.PAGES,
          pathname: '/',
          filename: `<root>/${SERVER_DIRECTORY}/pages/index.js`,
          page: '/',
          bundlePath: 'pages/index',
        },
      },
    ])(
      'returns the correct routes for $route.pathname',
      async ({ manifest, route }) => {
        const loader: ManifestLoader = {
          load: jest.fn(() => ({
            '/api/users/[id]': 'pages/api/users/[id].js',
            '/api/users': 'pages/api/users.js',
            ...manifest,
          })),
        }
        const matcher = new PagesRouteMatcher('<root>', loader)
        const routes = await matcher.routes()

        expect(loader.load).toBeCalledWith(PAGES_MANIFEST)
        expect(routes).toHaveLength(1)
        expect(routes[0]).toEqual(route)
      }
    )
  })
})

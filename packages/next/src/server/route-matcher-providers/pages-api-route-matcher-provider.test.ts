import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../shared/lib/constants'
import type { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'
import { RouteKind } from '../route-kind'
import type { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'
import { PagesAPIRouteMatcherProvider } from './pages-api-route-matcher-provider'

describe('PagesAPIRouteMatcherProvider', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const provider = new PagesAPIRouteMatcherProvider('<root>', loader)
    expect(await provider.matchers()).toEqual([])
    expect(loader.load).toHaveBeenCalledWith(PAGES_MANIFEST)
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: PagesAPIRouteDefinition
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
        const provider = new PagesAPIRouteMatcherProvider('<root>', loader)
        const matchers = await provider.matchers()

        expect(loader.load).toHaveBeenCalledWith(PAGES_MANIFEST)
        expect(matchers).toHaveLength(1)
        expect(matchers[0].definition).toEqual(route)
      }
    )
  })
})

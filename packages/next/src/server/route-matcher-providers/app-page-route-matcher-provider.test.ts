import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import type { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { RouteKind } from '../route-kind'
import { AppPageRouteMatcherProvider } from './app-page-route-matcher-provider'
import type { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'

describe('AppPageRouteMatcherProvider', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const matcher = new AppPageRouteMatcherProvider('<root>', loader)
    await expect(matcher.matchers()).resolves.toEqual([])
  })

  it.each([false, true])(
    'selects the children entry regardless of slot insertion order (%s)',
    async (reverse) => {
      const root = '/(group)/parallel/[slug]/page'
      const slot = '/(group)/parallel/@slot/[slug]/page'
      const entries = [slot, root]
      if (reverse) entries.reverse()
      const loader: ManifestLoader = {
        load: jest.fn(() =>
          Object.fromEntries(entries.map((page) => [page, `app${page}.js`]))
        ),
      }
      const provider = new AppPageRouteMatcherProvider('<root>', loader)
      const matchers = await provider.matchers()
      expect(matchers).toHaveLength(1)
      expect(matchers[0].definition).toEqual({
        kind: RouteKind.APP_PAGE,
        pathname: '/parallel/[slug]',
        page: root,
        filename: `<root>/${SERVER_DIRECTORY}/app${root}.js`,
        bundlePath: `app${root}`,
        appPaths: entries,
      })
    }
  )

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: AppPageRouteDefinition
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
          appPaths: ['/page'],
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
          appPaths: ['/(marketing)/about/page'],
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
          appPaths: ['/dashboard/users/[id]/page'],
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
          appPaths: ['/dashboard/users/page'],
        },
      },
      {
        manifest: {
          '/dashboard/users/page': 'app/dashboard/users/page.js',
          '/(marketing)/dashboard/users/page':
            'app/(marketing)/dashboard/users/page.js',
        },
        route: {
          kind: RouteKind.APP_PAGE,
          pathname: '/dashboard/users',
          filename: `<root>/${SERVER_DIRECTORY}/app/dashboard/users/page.js`,
          page: '/dashboard/users/page',
          bundlePath: 'app/dashboard/users/page',
          appPaths: [
            '/dashboard/users/page',
            '/(marketing)/dashboard/users/page',
          ],
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
        const matcher = new AppPageRouteMatcherProvider('<root>', loader)
        const matchers = await matcher.matchers()

        expect(loader.load).toHaveBeenCalled()
        expect(matchers).toHaveLength(1)
        expect(matchers[0].definition).toEqual(route)
      }
    )
  })
})

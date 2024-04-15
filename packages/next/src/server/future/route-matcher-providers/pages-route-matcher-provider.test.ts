import { PAGES_MANIFEST, SERVER_DIRECTORY } from '../../../shared/lib/constants'
import { I18NProvider } from '../helpers/i18n-provider'
import type { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import { RouteKind } from '../route-kind'
import type { ManifestLoader } from './helpers/manifest-loaders/manifest-loader'
import { PagesRouteMatcherProvider } from './pages-route-matcher-provider'

describe('PagesRouteMatcherProvider', () => {
  it('returns no routes with an empty manifest', async () => {
    const loader: ManifestLoader = { load: jest.fn(() => ({})) }
    const provider = new PagesRouteMatcherProvider('<root>', loader)
    expect(await provider.matchers()).toEqual([])
    expect(loader.load).toHaveBeenCalledWith(PAGES_MANIFEST)
  })

  describe('locale matching', () => {
    describe.each<{
      manifest: Record<string, string>
      routes: ReadonlyArray<PagesRouteDefinition>
      i18n: { locales: Array<string>; defaultLocale: string }
    }>([
      {
        manifest: {
          '/_app': 'pages/_app.js',
          '/_error': 'pages/_error.js',
          '/_document': 'pages/_document.js',
          '/blog/[slug]': 'pages/blog/[slug].js',
          '/en-US/404': 'pages/en-US/404.html',
          '/fr/404': 'pages/fr/404.html',
          '/nl-NL/404': 'pages/nl-NL/404.html',
          '/en-US': 'pages/en-US.html',
          '/fr': 'pages/fr.html',
          '/nl-NL': 'pages/nl-NL.html',
        },
        i18n: { locales: ['en-US', 'fr', 'nl-NL'], defaultLocale: 'en-US' },
        routes: [
          {
            kind: RouteKind.PAGES,
            pathname: '/blog/[slug]',
            filename: `<root>/${SERVER_DIRECTORY}/pages/blog/[slug].js`,
            page: '/blog/[slug]',
            bundlePath: 'pages/blog/[slug]',
            i18n: {},
          },
          {
            kind: RouteKind.PAGES,
            pathname: '/',
            filename: `<root>/${SERVER_DIRECTORY}/pages/en-US.html`,
            page: '/en-US',
            bundlePath: 'pages/en-US',
            i18n: {
              locale: 'en-US',
            },
          },
          {
            kind: RouteKind.PAGES,
            pathname: '/',
            filename: `<root>/${SERVER_DIRECTORY}/pages/fr.html`,
            page: '/fr',
            bundlePath: 'pages/fr',
            i18n: {
              locale: 'fr',
            },
          },
          {
            kind: RouteKind.PAGES,
            pathname: '/',
            filename: `<root>/${SERVER_DIRECTORY}/pages/nl-NL.html`,
            page: '/nl-NL',
            bundlePath: 'pages/nl-NL',
            i18n: {
              locale: 'nl-NL',
            },
          },
          {
            kind: RouteKind.PAGES,
            pathname: '/404',
            filename: `<root>/${SERVER_DIRECTORY}/pages/en-US/404.html`,
            page: '/en-US/404',
            bundlePath: 'pages/en-US/404',
            i18n: {
              locale: 'en-US',
            },
          },
          {
            kind: RouteKind.PAGES,
            pathname: '/404',
            filename: `<root>/${SERVER_DIRECTORY}/pages/fr/404.html`,
            page: '/fr/404',
            bundlePath: 'pages/fr/404',
            i18n: {
              locale: 'fr',
            },
          },
          {
            kind: RouteKind.PAGES,
            pathname: '/404',
            filename: `<root>/${SERVER_DIRECTORY}/pages/nl-NL/404.html`,
            page: '/nl-NL/404',
            bundlePath: 'pages/nl-NL/404',
            i18n: {
              locale: 'nl-NL',
            },
          },
        ],
      },
    ])('locale', ({ routes: expected, manifest, i18n }) => {
      it.each(expected)('has the match for $pathname', async (route) => {
        const loader: ManifestLoader = {
          load: jest.fn(() => ({
            '/api/users/[id]': 'pages/api/users/[id].js',
            '/api/users': 'pages/api/users.js',
            ...manifest,
          })),
        }
        const provider = new PagesRouteMatcherProvider(
          '<root>',
          loader,
          new I18NProvider(i18n)
        )
        const matchers = await provider.matchers()

        expect(loader.load).toHaveBeenCalledWith(PAGES_MANIFEST)
        const routes = matchers.map((matcher) => matcher.definition)
        expect(routes).toContainEqual(route)
        expect(routes).toHaveLength(expected.length)
      })
    })
  })

  describe('manifest matching', () => {
    it.each<{
      manifest: Record<string, string>
      route: PagesRouteDefinition
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
        const matcher = new PagesRouteMatcherProvider('<root>', loader)
        const matchers = await matcher.matchers()

        expect(loader.load).toHaveBeenCalledWith(PAGES_MANIFEST)
        expect(matchers).toHaveLength(1)
        expect(matchers[0].definition).toEqual(route)
      }
    )
  })
})
